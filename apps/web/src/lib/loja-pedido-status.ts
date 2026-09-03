import 'server-only'
import { db, type Prisma } from '@torcida/db'
import { revalidatePath } from 'next/cache'
import { chaveTamanho } from '@torcida/types'
import { garantirLancamentoFinanceiroPedido } from '@/lib/loja-financeiro'
import { fecharTicketPorStatusPedido } from '@/lib/loja-ticket'
import { notificarSafe, reconciliarNotificacoesDoEvento } from '@/lib/notificacoes'
import { invalidateAdminDirecao } from '@/lib/admin-direcao-cache'

/**
 * A transição de status de um pedido da loja, num lugar só.
 *
 * Extraída de `atualizarStatusPedido` quando a retirada por QR virou um segundo
 * caminho para o mesmo desfecho. O que ela carrega não é trivial — restaurar
 * estoque no cancelamento, lançar a receita no livro-caixa, fechar o ticket com
 * motivo, notificar o comprador e invalidar sete caches — e **cada cópia dessa
 * lista é uma que vai ficar para trás na próxima mudança do financeiro.**
 *
 * A permissão fica fora daqui de propósito: quem chama decide o gate. O balcão
 * exige `store:manage` tanto pelo formulário quanto pelo QR, mas a regra é de
 * quem chama, não desta função.
 */

export type StatusPedidoLoja = 'PENDENTE' | 'CONFIRMADO' | 'CANCELADO' | 'ENTREGUE'

export type AplicarStatusPedidoResult = { ok: true } | { ok: false; error: string }

/** Devolve ao estoque o que o pedido havia reservado, por tamanho. */
async function restaurarEstoquePedido(pedidoId: string, tx: Prisma.TransactionClient) {
  const itens = await tx.saasPedidoItem.findMany({
    where: { pedidoId },
    include: { produto: { select: { estoque: true } } },
  })
  for (const item of itens) {
    const estoque = (item.produto.estoque ?? {}) as Record<string, number>
    const chave = chaveTamanho(item.tamanho)
    const novo = { ...estoque, [chave]: (estoque[chave] ?? 0) + item.quantidade }
    await tx.saasProduto.update({ where: { id: item.produtoId }, data: { estoque: novo } })
  }
}

export async function aplicarStatusPedido(input: {
  pedidoId: string
  statusNovo: StatusPedidoLoja
  tenantId: string
  atorId: string
}): Promise<AplicarStatusPedidoResult> {
  const { pedidoId, statusNovo, tenantId, atorId } = input

  const pedido: {
    status: string
    total: Prisma.Decimal
    financeiroLancamentoId: string | null
    userId: string
    itens: Array<{ produtoNome: string; quantidade: number }>
  } | null = await db.saasPedido.findFirst({
    where: { id: pedidoId, tenantId },
    select: {
      status: true,
      total: true,
      financeiroLancamentoId: true,
      userId: true,
      itens: { select: { produtoNome: true, quantidade: true } },
    },
  })
  if (!pedido) return { ok: false, error: 'Pedido não encontrado' }

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    if (statusNovo === 'CANCELADO' && pedido.status !== 'CANCELADO') {
      await restaurarEstoquePedido(pedidoId, tx)
    }

    await tx.saasPedido.update({
      where: { id: pedidoId, tenantId },
      data: { status: statusNovo },
    })

    // CONFIRMADO / ENTREGUE = pedido "pago" operacional (sem gateway ainda).
    if (
      (statusNovo === 'CONFIRMADO' || statusNovo === 'ENTREGUE') &&
      !pedido.financeiroLancamentoId
    ) {
      const resumoItens = pedido.itens.map((i) => `${i.produtoNome} ×${i.quantidade}`).join(', ')
      await garantirLancamentoFinanceiroPedido(tx, {
        tenantId,
        pedidoId,
        total: pedido.total,
        atorId,
        itensResumo: resumoItens,
      })
    }
  })

  await db.auditLog.create({
    data: {
      tenantId,
      atorId,
      acao: 'PEDIDO_STATUS_ATUALIZADO',
      entidade: 'SaasPedido',
      entidadeId: pedidoId,
      detalhes: { status: statusNovo },
    },
  })

  try {
    const ticketFechado = await fecharTicketPorStatusPedido(pedidoId, statusNovo, atorId)
    if (ticketFechado?.motivoFecho) {
      await db.auditLog.create({
        data: {
          tenantId,
          atorId,
          acao: 'PEDIDO_TICKET_FECHADO',
          entidade: 'SaasPedidoTicket',
          entidadeId: ticketFechado.id,
          detalhes: { pedidoId, motivo: ticketFechado.motivoFecho, via: 'status_pedido' },
        },
      })
    }
  } catch {
    // Status do pedido já gravado — falha no fecho do ticket não reverte.
  }

  if (statusNovo !== pedido.status) {
    const notificacaoPorStatus: Partial<
      Record<
        StatusPedidoLoja,
        { tipo: 'PEDIDO_CONFIRMADO' | 'PEDIDO_CANCELADO' | 'PEDIDO_ENTREGUE'; titulo: string }
      >
    > = {
      CONFIRMADO: { tipo: 'PEDIDO_CONFIRMADO', titulo: 'Pedido confirmado' },
      CANCELADO: { tipo: 'PEDIDO_CANCELADO', titulo: 'Pedido cancelado' },
      ENTREGUE: { tipo: 'PEDIDO_ENTREGUE', titulo: 'Pedido entregue' },
    }
    const notificacao = notificacaoPorStatus[statusNovo]
    if (notificacao) {
      await reconciliarNotificacoesDoEvento(tenantId, {
        tipo: 'PEDIDO_RECEBIDO',
        atorId: pedido.userId,
      })
      await notificarSafe({
        userId: pedido.userId,
        tenantId,
        tipo: notificacao.tipo,
        titulo: notificacao.titulo,
        link: '/portal/loja/pedidos',
        atorId,
      })
    }
  }

  invalidateAdminDirecao(tenantId)
  for (const rota of [
    '/admin/loja/pedidos',
    '/admin/loja/atendimento',
    '/admin/loja',
    '/admin/loja/produtos',
    '/portal/loja/pedidos',
    '/portal/mensagens',
    '/admin/financeiro',
    '/portal/financeiro',
    '/portal/balanco',
  ]) {
    revalidatePath(rota)
  }

  return { ok: true }
}
