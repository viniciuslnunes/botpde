import 'server-only'

import { db } from '@torcida/db'
import type { Prisma } from '@torcida/db'

/**
 * Garante RECEITA LOJA no livro-caixa para pedido confirmado/entregue.
 * Idempotente via `SaasPedido.financeiroLancamentoId`.
 */
export async function garantirLancamentoFinanceiroPedido(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string
    pedidoId: string
    total: Prisma.Decimal | number
    atorId: string
    itensResumo?: string
  },
): Promise<string> {
  const pedido: { financeiroLancamentoId: string | null } | null = await tx.saasPedido.findFirst({
    where: { id: input.pedidoId, tenantId: input.tenantId },
    select: { financeiroLancamentoId: true },
  })
  if (!pedido) throw new Error('Pedido não encontrado')
  if (pedido.financeiroLancamentoId) return pedido.financeiroLancamentoId

  const descricao =
    input.itensResumo && input.itensResumo.length > 0
      ? `Pedido loja — ${input.itensResumo}`.slice(0, 240)
      : `Pedido loja ${input.pedidoId.slice(0, 8)}`

  const lanc: { id: string } = await tx.financeiroLancamento.create({
    data: {
      tenantId: input.tenantId,
      tipo: 'RECEITA',
      categoria: 'LOJA',
      valor: input.total,
      descricao,
      data: new Date(),
      observacao: `Pedido ${input.pedidoId}`,
      criadoPorId: input.atorId,
    },
    select: { id: true },
  })

  await tx.saasPedido.update({
    where: { id: input.pedidoId },
    data: { financeiroLancamentoId: lanc.id },
  })

  return lanc.id
}
