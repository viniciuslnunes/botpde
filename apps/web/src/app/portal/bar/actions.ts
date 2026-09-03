'use server'

import { db, type Prisma } from '@torcida/db'
import { revalidatePath } from 'next/cache'
import { CompraBarPortalSchema, resumirVenda } from '@torcida/types'
import { auth } from '@/lib/auth'
import { assertMembroAtivo } from '@/lib/authz'
import { getTenantFromHost } from '@/lib/tenant'
import { getTurnoAbertoBar, resolveUnidadeBar } from '@/lib/bar'
import { criarCobrancaPixBar } from '@/lib/pix-gateway'

/**
 * Compra antecipada no bar: o sócio paga pelo celular e retira no balcão.
 *
 * **O gate não é `BAR_OPERATE`.** Quem age é o sócio sobre a própria compra,
 * não um operador sobre o caixa: exigir a permissão do bar travaria o fluxo, e
 * reusar `registrarVendaBar` daria a qualquer sócio o poder de registrar venda,
 * conceder desconto e lançar fiado. O critério aqui é sessão + vínculo ativo.
 *
 * **Turno aberto é requisito, não detalhe.** A pergunta que travava esta feature
 * era "em qual turno de caixa entra uma venda feita fora do turno?" — e a
 * resposta foi eliminar o caso: o bar só aparece no portal com turno aberto,
 * então toda venda antecipada nasce dentro de um turno e a conferência de caixa
 * continua fechando. Se o turno fechar entre a escolha e o pagamento, esta
 * action recusa.
 *
 * O **operador** da venda é quem abriu o turno, não o comprador: é ele quem
 * responde pela entrega e em cujo caixa o dinheiro entra. O comprador fica em
 * `compradorUserId`, que é campo próprio justamente para não poluir o relatório
 * por operador.
 */

export type CompraBarPortalResult =
  | { ok: true; vendaId: string; total: number; pixCopiaCola: string | null }
  | { ok: false; error: string }

export async function comprarNoBarPortal(input: unknown): Promise<CompraBarPortalResult> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, error: 'Entre na sua conta para comprar.' }
  const userId = session.user.id

  const tenant = await getTenantFromHost()
  if (!tenant) return { ok: false, error: 'Torcida não encontrada.' }

  try {
    await assertMembroAtivo(tenant.id, userId)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Vínculo inativo.' }
  }

  const parsed = CompraBarPortalSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? 'Dados inválidos' }
  }

  const unidade = await resolveUnidadeBar(tenant.id, userId)
  if (!unidade) return { ok: false, error: 'Bar indisponível para a sua unidade.' }

  const turno = await getTurnoAbertoBar(tenant.id, unidade.id)
  if (!turno) {
    return { ok: false, error: 'O bar está fechado agora. Tente quando o caixa abrir.' }
  }

  // Consolida por produto: repetir o mesmo id em linhas separadas burlaria a
  // checagem de estoque (mesma proteção do PDV).
  const porProduto = new Map<string, number>()
  for (const item of parsed.data.itens) {
    porProduto.set(item.produtoId, (porProduto.get(item.produtoId) ?? 0) + item.quantidade)
  }

  type Criada = { vendaId: string; total: number }
  let criada: Criada
  try {
    criada = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      type ProdutoRow = {
        id: string
        nome: string
        preco: Prisma.Decimal
        custoMedio: Prisma.Decimal
        estoque: number
        ativo: boolean
      }
      const produtos: ProdutoRow[] = await tx.barProduto.findMany({
        where: { id: { in: [...porProduto.keys()] }, tenantId: tenant.id, sedeId: unidade.id },
        select: { id: true, nome: true, preco: true, custoMedio: true, estoque: true, ativo: true },
      })
      const porId = new Map<string, ProdutoRow>(produtos.map((p) => [p.id, p]))

      const linhas: {
        produtoId: string
        produtoNome: string
        quantidade: number
        precoUnit: number
        custoUnit: number
        total: number
      }[] = []

      for (const [produtoId, quantidade] of porProduto) {
        const produto = porId.get(produtoId)
        if (!produto) throw new Error('Produto não encontrado')
        if (!produto.ativo) throw new Error(`Produto indisponível: ${produto.nome}`)
        if (produto.estoque < quantidade) throw new Error(`Acabou: ${produto.nome}`)
        const precoUnit = Number(produto.preco)
        linhas.push({
          produtoId,
          produtoNome: produto.nome,
          quantidade,
          precoUnit,
          custoUnit: Number(produto.custoMedio),
          total: Math.round(precoUnit * quantidade * 100) / 100,
        })
      }

      const resumo = resumirVenda(linhas, 0)
      if (resumo.total <= 0) throw new Error('Total inválido')

      const venda: { id: string } = await tx.barVenda.create({
        data: {
          tenantId: tenant.id,
          sedeId: unidade.id,
          turnoId: turno.id,
          operadorId: turno.abertoPor.id,
          origem: 'PORTAL',
          compradorUserId: userId,
          subtotal: resumo.subtotal,
          desconto: 0,
          total: resumo.total,
          metodoPagamento: 'PIX',
          status: 'PENDENTE',
          itens: { create: linhas },
        },
        select: { id: true },
      })

      // Estoque baixa aqui (decisão do usuário: no pagamento, e o PDV já se
      // comporta assim com PIX pendente — a venda reserva a mercadoria). O
      // cancelamento devolve, pelo mesmo caminho do PDV.
      for (const linha of linhas) {
        await tx.barProduto.update({
          where: { id: linha.produtoId },
          data: { estoque: { decrement: linha.quantidade } },
        })
        await tx.barMovimentacaoEstoque.create({
          data: {
            tenantId: tenant.id,
            sedeId: unidade.id,
            produtoId: linha.produtoId,
            tipo: 'SAIDA',
            quantidade: linha.quantidade,
            vendaId: venda.id,
            operadorId: turno.abertoPor.id,
          },
        })
      }

      return { vendaId: venda.id, total: resumo.total }
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Não foi possível comprar.' }
  }

  let pixCopiaCola: string | null = null
  try {
    const cobranca = await criarCobrancaPixBar({
      vendaId: criada.vendaId,
      tenantSlug: tenant.slug,
      valor: criada.total,
      descricao: 'Compra antecipada no bar',
      payerEmail: session.user.email,
    })
    await db.barVenda.update({
      where: { id: criada.vendaId },
      data: {
        gatewayProvider: cobranca.provider,
        gatewayExternalId: cobranca.externalId,
        pixCopiaCola: cobranca.copiaCola,
      },
    })
    pixCopiaCola = cobranca.copiaCola
  } catch {
    // Sem cobrança não há como pagar: cancela e devolve o estoque, para não
    // deixar venda pendente órfã segurando bebida que ninguém vai buscar.
    await cancelarCompraSemCobranca(tenant.id, criada.vendaId)
    return { ok: false, error: 'Não foi possível gerar o PIX. A compra foi cancelada.' }
  }

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: userId,
      acao: 'BAR_COMPRA_ANTECIPADA',
      entidade: 'BarVenda',
      entidadeId: criada.vendaId,
      detalhes: { total: criada.total, turnoId: turno.id, sedeId: unidade.id },
    },
  })

  revalidatePath('/portal/bar')
  return { ok: true, vendaId: criada.vendaId, total: criada.total, pixCopiaCola }
}

/** Desfaz a venda e devolve o estoque quando o gateway não respondeu. */
async function cancelarCompraSemCobranca(tenantId: string, vendaId: string): Promise<void> {
  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    // `produtoId` é nulo em item cujo produto foi excluído depois da venda —
    // não há a quem devolver estoque nesse caso.
    const itens: { produtoId: string | null; quantidade: number }[] =
      await tx.barVendaItem.findMany({
        where: { vendaId },
        select: { produtoId: true, quantidade: true },
      })
    for (const item of itens) {
      if (!item.produtoId) continue
      await tx.barProduto.update({
        where: { id: item.produtoId },
        data: { estoque: { increment: item.quantidade } },
      })
    }
    await tx.barMovimentacaoEstoque.deleteMany({ where: { vendaId, tenantId } })
    await tx.barVenda.update({
      where: { id: vendaId },
      data: { status: 'CANCELADA', observacao: 'Falha ao gerar cobrança PIX' },
    })
  })
}
