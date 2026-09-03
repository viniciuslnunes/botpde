'use server'

import { db } from '@torcida/db'
import { idCurtoPedido, PERMISSIONS } from '@torcida/types'
import { assertPermission } from '@/lib/authz'
import { extrairPayloadDeQr } from '@/lib/qr-token'
import { lerQrRetirada } from '@/lib/pedido-qr'
import { aplicarStatusPedido } from '@/lib/loja-pedido-status'

/**
 * Balcão da loja: bipar o QR do comprador entrega o pedido.
 *
 * A action faz **só a parte que é dela** — identificar qual pedido o QR
 * aponta e decidir se aquele pedido pode ser entregue agora. A transição em si
 * é delegada a `aplicarStatusPedido`, que já sabe restaurar estoque, lançar a
 * receita no livro-caixa, fechar o ticket com motivo `ENTREGUE` e auditar.
 * Duplicar essas regras aqui garantiria que uma das cópias ficasse para trás na
 * primeira mudança do financeiro.
 */

export type ResultadoRetirada =
  | { ok: true; idCurto: string; comprador: string; itens: string }
  | { ok: false; error: string }

export async function confirmarRetiradaPorQr(payloadBruto: string): Promise<ResultadoRetirada> {
  const { session, tenant } = await assertPermission(PERMISSIONS.STORE_MANAGE)

  const pedidoId = lerQrRetirada(extrairPayloadDeQr(payloadBruto))
  if (!pedidoId) return { ok: false, error: 'QR inválido ou adulterado.' }

  const pedido: {
    id: string
    status: string
    modalidadeEntrega: string
    user: { nome: string | null; email: string | null }
    itens: Array<{ produtoNome: string; quantidade: number }>
  } | null = await db.saasPedido.findFirst({
    where: { id: pedidoId, tenantId: tenant.id },
    select: {
      id: true,
      status: true,
      modalidadeEntrega: true,
      user: { select: { nome: true, email: true } },
      itens: { select: { produtoNome: true, quantidade: true } },
    },
  })

  // Pedido de outra loja cai aqui como "não encontrado" de propósito: o
  // conferente não precisa saber que ele existe em outro tenant.
  if (!pedido) return { ok: false, error: 'Pedido não encontrado nesta loja.' }

  if (pedido.modalidadeEntrega !== 'RETIRADA') {
    return { ok: false, error: 'Este pedido é de envio, não de retirada no balcão.' }
  }
  if (pedido.status === 'CANCELADO') {
    return { ok: false, error: 'Este pedido foi cancelado.' }
  }
  if (pedido.status === 'ENTREGUE') {
    return { ok: false, error: 'Este pedido já foi retirado.' }
  }

  const r = await aplicarStatusPedido({
    pedidoId: pedido.id,
    statusNovo: 'ENTREGUE',
    tenantId: tenant.id,
    atorId: session.user.id,
  })
  if (!r.ok) return { ok: false, error: r.error }

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'PEDIDO_RETIRADA_QR',
      entidade: 'SaasPedido',
      entidadeId: pedido.id,
      detalhes: { statusAnterior: pedido.status },
    },
  })

  return {
    ok: true,
    idCurto: idCurtoPedido(pedido.id),
    comprador: pedido.user.nome?.trim() || pedido.user.email || 'Comprador',
    itens: pedido.itens.map((i) => `${i.produtoNome} ×${i.quantidade}`).join(', '),
  }
}
