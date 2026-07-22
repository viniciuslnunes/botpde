import 'server-only'

import { cache } from 'react'
import { db } from '@torcida/db'
import type { StatusPedido } from '@torcida/db'
import { Prisma } from '@torcida/db'
import { resolverIntervaloPeriodo, type Periodo } from '@/lib/admin-insights'

/** Receita da loja = pedidos CONFIRMADO/ENTREGUE. PENDENTE é "aguardando"; CANCELADO não conta. */
const STATUS_RECEITA_LOJA: StatusPedido[] = ['CONFIRMADO', 'ENTREGUE']

export type LojaVendasPeriodo = {
  receita: number
  pedidos: number
  ticketMedio: number
}

export type LojaVendasResumo = {
  atual: LojaVendasPeriodo
  anterior: LojaVendasPeriodo
  /** Contagem por status no período atual (todos os status, incl. PENDENTE/CANCELADO). */
  porStatus: Partial<Record<StatusPedido, number>>
}

type PedidoAggRow = {
  _sum: { total: Prisma.Decimal | null }
  _count: { _all: number }
}

function aggParaPeriodo(agg: PedidoAggRow): LojaVendasPeriodo {
  const receita = Number(agg._sum.total ?? 0)
  const pedidos = agg._count._all
  return {
    receita,
    pedidos,
    ticketMedio: pedidos > 0 ? receita / pedidos : 0,
  }
}

/** Vendas da loja no período vs período anterior + distribuição por status. */
export const resumirVendasLoja = cache(async function resumirVendasLoja(
  tenantId: string,
  periodo: Periodo,
): Promise<LojaVendasResumo> {
  const { inicio, fim, inicioAnterior, fimAnterior } = resolverIntervaloPeriodo(periodo)

  const [aggAtual, aggAnterior, porStatusRows]: [
    PedidoAggRow,
    PedidoAggRow,
    Array<{ status: StatusPedido; _count: { _all: number } }>,
  ] = await Promise.all([
    db.saasPedido.aggregate({
      where: {
        tenantId,
        status: { in: STATUS_RECEITA_LOJA },
        criadoEm: { gte: inicio, lte: fim },
      },
      _sum: { total: true },
      _count: { _all: true },
    }),
    db.saasPedido.aggregate({
      where: {
        tenantId,
        status: { in: STATUS_RECEITA_LOJA },
        criadoEm: { gte: inicioAnterior, lte: fimAnterior },
      },
      _sum: { total: true },
      _count: { _all: true },
    }),
    db.saasPedido.groupBy({
      by: ['status'],
      where: { tenantId, criadoEm: { gte: inicio, lte: fim } },
      _count: { _all: true },
    }),
  ])

  const porStatus: Partial<Record<StatusPedido, number>> = {}
  for (const row of porStatusRows) {
    porStatus[row.status] = row._count._all
  }

  return {
    atual: aggParaPeriodo(aggAtual),
    anterior: aggParaPeriodo(aggAnterior),
    porStatus,
  }
})

export type LojaMaisVendido = {
  produtoNome: string
  quantidade: number
  receita: number
}

/** Top 5 produtos por quantidade nos pedidos CONFIRMADO/ENTREGUE do período. */
export const listarMaisVendidosLoja = cache(async function listarMaisVendidosLoja(
  tenantId: string,
  periodo: Periodo,
): Promise<LojaMaisVendido[]> {
  const { inicio, fim } = resolverIntervaloPeriodo(periodo)

  const grouped: Array<{
    produtoId: string
    _sum: { quantidade: number | null; total: Prisma.Decimal | null }
  }> = await db.saasPedidoItem.groupBy({
    by: ['produtoId'],
    where: {
      pedido: {
        is: {
          tenantId,
          status: { in: STATUS_RECEITA_LOJA },
          criadoEm: { gte: inicio, lte: fim },
        },
      },
    },
    _sum: { quantidade: true, total: true },
    orderBy: { _sum: { quantidade: 'desc' } },
    take: 5,
  })

  const ids = grouped.map((g) => g.produtoId)
  const produtos: Array<{ id: string; nome: string }> =
    ids.length === 0
      ? []
      : await db.saasProduto.findMany({
          where: { tenantId, id: { in: ids } },
          select: { id: true, nome: true },
        })
  const nomePorId = new Map<string, string>(produtos.map((p) => [p.id, p.nome]))

  return grouped.map((g) => ({
    produtoNome: nomePorId.get(g.produtoId) ?? 'Produto',
    quantidade: g._sum.quantidade ?? 0,
    receita: Number(g._sum.total ?? 0),
  }))
})

export type LojaCupomUso = {
  codigo: string
  usos: number
  descontoTotal: number
}

/**
 * Uso de cupons no período: usos + desconto concedido.
 * Conta pedidos não-cancelados (PENDENTE ainda é uso; CANCELADO não concedeu nada).
 */
export const resumirUsoCupons = cache(async function resumirUsoCupons(
  tenantId: string,
  periodo: Periodo,
): Promise<LojaCupomUso[]> {
  const { inicio, fim } = resolverIntervaloPeriodo(periodo)

  const grouped: Array<{
    cupomCodigo: string | null
    _count: { _all: number }
    _sum: { desconto: Prisma.Decimal | null }
  }> = await db.saasPedido.groupBy({
    by: ['cupomCodigo'],
    where: {
      tenantId,
      cupomCodigo: { not: null },
      status: { not: 'CANCELADO' },
      criadoEm: { gte: inicio, lte: fim },
    },
    _count: { _all: true },
    _sum: { desconto: true },
  })

  return grouped
    .filter((g): g is typeof g & { cupomCodigo: string } => g.cupomCodigo !== null)
    .map((g) => ({
      codigo: g.cupomCodigo,
      usos: g._count._all,
      descontoTotal: Number(g._sum.desconto ?? 0),
    }))
    .sort((a, b) => b.usos - a.usos)
    .slice(0, 8)
})
