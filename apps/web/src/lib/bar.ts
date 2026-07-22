import 'server-only'

import { cache } from 'react'
import { db } from '@torcida/db'
import type { MetodoPagamentoBar, StatusVendaBar, TipoSede } from '@torcida/db'
import { Prisma } from '@torcida/db'
import { BAR_PAGE_SIZE } from '@torcida/types'
import {
  bucketSomaPorDia,
  resolverIntervaloPeriodo,
  type Periodo,
  type SerieTemporal,
} from '@/lib/admin-insights'

export type BarUnidadeLite = {
  id: string
  nome: string
  tipo: TipoSede
}

export type BarCategoriaLite = {
  id: string
  nome: string
  slug: string
  ordem: number
  ativo: boolean
}

export type BarProdutoLite = {
  id: string
  nome: string
  descricao: string | null
  preco: Prisma.Decimal
  custoMedio: Prisma.Decimal
  estoque: number
  estoqueMinimo: number | null
  imagemUrl: string | null
  ativo: boolean
  destaque: boolean
  ordem: number
  categoria: { id: string; nome: string } | null
}

export type BarVendaItemLite = {
  id: string
  produtoId: string | null
  produtoNome: string
  quantidade: number
  precoUnit: Prisma.Decimal
  total: Prisma.Decimal
}

export type BarVendaLite = {
  id: string
  subtotal: Prisma.Decimal
  desconto: Prisma.Decimal
  total: Prisma.Decimal
  metodoPagamento: MetodoPagamentoBar
  status: StatusVendaBar
  pagoEm: Date | null
  observacao: string | null
  criadoEm: Date
  pixCopiaCola: string | null
  gatewayProvider: string | null
  operador: { id: string; nome: string | null }
  itens: BarVendaItemLite[]
}

export type BarVendasResumo = {
  totalVendas: number
  totalPago: number
  quantidade: number
}

const produtoSelect = {
  id: true,
  nome: true,
  descricao: true,
  preco: true,
  custoMedio: true,
  estoque: true,
  estoqueMinimo: true,
  imagemUrl: true,
  ativo: true,
  destaque: true,
  ordem: true,
  categoria: { select: { id: true, nome: true } },
} satisfies Prisma.BarProdutoSelect

/**
 * Resolve a unidade operacional do Bar para o usuário no tenant.
 *
 * 1. `SaasMembro.sedeId` (unidade do vínculo territorial)
 * 2. Senão, a SEDE principal ativa do tenant
 *
 * Garante isolamento: sede/subsede/PDE não compartilham estoque.
 */
export const resolveUnidadeBar = cache(async function resolveUnidadeBar(
  tenantId: string,
  userId: string,
): Promise<BarUnidadeLite> {
  const membro: { sedeId: string | null } | null = await db.saasMembro.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
    select: { sedeId: true },
  })

  if (membro?.sedeId) {
    const unidade: BarUnidadeLite | null = await db.sede.findFirst({
      where: { id: membro.sedeId, tenantId, ativa: true },
      select: { id: true, nome: true, tipo: true },
    })
    if (unidade) return unidade
  }

  const sedePrincipal: BarUnidadeLite | null = await db.sede.findFirst({
    where: { tenantId, tipo: 'SEDE', ativa: true },
    orderBy: { criadoEm: 'asc' },
    select: { id: true, nome: true, tipo: true },
  })
  if (sedePrincipal) return sedePrincipal

  // Último recurso: qualquer unidade ativa do tenant (PDE/subsede órfãos).
  const qualquer: BarUnidadeLite | null = await db.sede.findFirst({
    where: { tenantId, ativa: true },
    orderBy: { criadoEm: 'asc' },
    select: { id: true, nome: true, tipo: true },
  })
  if (qualquer) return qualquer

  throw new Error('Nenhuma unidade (sede/subsede/PDE) ativa neste tenant para operar o Bar')
})

/** Confirma que a unidade pertence ao tenant (antes de mutações). */
export async function assertUnidadeDoTenant(
  tenantId: string,
  sedeId: string,
): Promise<BarUnidadeLite> {
  const unidade: BarUnidadeLite | null = await db.sede.findFirst({
    where: { id: sedeId, tenantId, ativa: true },
    select: { id: true, nome: true, tipo: true },
  })
  if (!unidade) throw new Error('Unidade inválida para este tenant')
  return unidade
}

export const listarProdutosBar = cache(async function listarProdutosBar(
  tenantId: string,
  sedeId: string,
  opts?: { apenasAtivos?: boolean; categoriaId?: string },
): Promise<BarProdutoLite[]> {
  const where: Prisma.BarProdutoWhereInput = { tenantId, sedeId }
  if (opts?.apenasAtivos) where.ativo = true
  if (opts?.categoriaId) where.categoriaId = opts.categoriaId

  const rows: BarProdutoLite[] = await db.barProduto.findMany({
    where,
    orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
    select: produtoSelect,
  })
  return rows
})

export const listarCategoriasBar = cache(async function listarCategoriasBar(
  tenantId: string,
  sedeId: string,
): Promise<BarCategoriaLite[]> {
  const rows: BarCategoriaLite[] = await db.barCategoria.findMany({
    where: { tenantId, sedeId },
    orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
    select: { id: true, nome: true, slug: true, ordem: true, ativo: true },
  })
  return rows
})

export const listarVendasBar = cache(async function listarVendasBar(
  tenantId: string,
  sedeId: string,
  opts?: { status?: StatusVendaBar; page?: number; pageSize?: number },
): Promise<{ itens: BarVendaLite[]; page: number; pageSize: number; total: number }> {
  const pageSize = opts?.pageSize ?? BAR_PAGE_SIZE
  const page = Math.max(1, opts?.page ?? 1)
  const where: Prisma.BarVendaWhereInput = { tenantId, sedeId }
  if (opts?.status) where.status = opts.status

  const [total, rows]: [number, BarVendaLite[]] = await Promise.all([
    db.barVenda.count({ where }),
    db.barVenda.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        subtotal: true,
        desconto: true,
        total: true,
        metodoPagamento: true,
        status: true,
        pagoEm: true,
        observacao: true,
        criadoEm: true,
        pixCopiaCola: true,
        gatewayProvider: true,
        operador: { select: { id: true, nome: true } },
        itens: {
          select: {
            id: true,
            produtoId: true,
            produtoNome: true,
            quantidade: true,
            precoUnit: true,
            total: true,
          },
        },
      },
    }),
  ])

  return { itens: rows, page, pageSize, total }
})

/** Resumo das vendas pagas da unidade (bruto, líquido após desconto e quantidade). */
export const resumirVendasBar = cache(async function resumirVendasBar(
  tenantId: string,
  sedeId: string,
  opts?: { desde?: Date },
): Promise<BarVendasResumo> {
  const where: Prisma.BarVendaWhereInput = { tenantId, sedeId, status: 'PAGA' }
  if (opts?.desde) where.criadoEm = { gte: opts.desde }

  const agg: {
    _sum: { subtotal: Prisma.Decimal | null; total: Prisma.Decimal | null }
    _count: { _all: number }
  } = await db.barVenda.aggregate({
    where,
    _sum: { subtotal: true, total: true },
    _count: { _all: true },
  })

  return {
    totalVendas: Number(agg._sum.subtotal ?? 0),
    totalPago: Number(agg._sum.total ?? 0),
    quantidade: agg._count._all,
  }
})

/**
 * Vendas PAGAS por dia (valor = total líquido), últimos `dias` dias.
 * Sem `sedeId` = torcida inteira (relatórios); com `sedeId` = unidade (hub).
 */
export const resumirVendasBarPorDia = cache(async function resumirVendasBarPorDia(
  tenantId: string,
  dias: number,
  sedeId?: string,
): Promise<SerieTemporal> {
  const fim = new Date()
  const inicio = new Date(fim.getTime() - dias * 24 * 60 * 60 * 1000)
  const where: Prisma.BarVendaWhereInput = { tenantId, status: 'PAGA', criadoEm: { gte: inicio } }
  if (sedeId) where.sedeId = sedeId

  const rows: Array<{ criadoEm: Date; total: Prisma.Decimal }> = await db.barVenda.findMany({
    where,
    select: { criadoEm: true, total: true },
  })

  return bucketSomaPorDia(
    rows.map((r) => ({ data: r.criadoEm, valor: Number(r.total) })),
    inicio,
    fim,
  )
})

export type BarMaisVendido = {
  produtoNome: string
  quantidade: number
  receita: number
}

/** Top 5 produtos por quantidade nas vendas PAGAS do período. */
export const listarMaisVendidosBar = cache(async function listarMaisVendidosBar(
  tenantId: string,
  periodo: Periodo,
  sedeId?: string,
): Promise<BarMaisVendido[]> {
  const { inicio, fim } = resolverIntervaloPeriodo(periodo)
  const whereVenda: Prisma.BarVendaWhereInput = {
    tenantId,
    status: 'PAGA',
    criadoEm: { gte: inicio, lte: fim },
  }
  if (sedeId) whereVenda.sedeId = sedeId

  const grouped: Array<{
    produtoId: string | null
    _sum: { quantidade: number | null; total: Prisma.Decimal | null }
  }> = await db.barVendaItem.groupBy({
    by: ['produtoId'],
    where: { venda: { is: whereVenda } },
    _sum: { quantidade: true, total: true },
    orderBy: { _sum: { quantidade: 'desc' } },
    take: 5,
  })

  const ids = grouped.map((g) => g.produtoId).filter((id): id is string => id !== null)
  const produtos: Array<{ id: string; nome: string }> =
    ids.length === 0
      ? []
      : await db.barProduto.findMany({
          where: { tenantId, id: { in: ids } },
          select: { id: true, nome: true },
        })
  const nomePorId = new Map<string, string>(produtos.map((p) => [p.id, p.nome]))

  return grouped.map((g) => ({
    // Produto removido do catálogo (produtoId = null via SetNull) vira "Item avulso".
    produtoNome: (g.produtoId ? nomePorId.get(g.produtoId) : null) ?? 'Item avulso',
    quantidade: g._sum.quantidade ?? 0,
    receita: Number(g._sum.total ?? 0),
  }))
})

export type BarVendasComparativo = {
  atual: BarVendasResumo
  anterior: BarVendasResumo
}

type BarVendaAggRow = {
  _sum: { subtotal: Prisma.Decimal | null; total: Prisma.Decimal | null }
  _count: { _all: number }
}

function aggParaResumo(agg: BarVendaAggRow): BarVendasResumo {
  return {
    totalVendas: Number(agg._sum.subtotal ?? 0),
    totalPago: Number(agg._sum.total ?? 0),
    quantidade: agg._count._all,
  }
}

/** Vendas PAGAS do período vs período imediatamente anterior (TrendDelta). */
export const compararVendasBarPeriodo = cache(async function compararVendasBarPeriodo(
  tenantId: string,
  periodo: Periodo,
  sedeId?: string,
): Promise<BarVendasComparativo> {
  const { inicio, fim, inicioAnterior, fimAnterior } = resolverIntervaloPeriodo(periodo)
  const base: Prisma.BarVendaWhereInput = { tenantId, status: 'PAGA' }
  if (sedeId) base.sedeId = sedeId

  const [atual, anterior]: [BarVendaAggRow, BarVendaAggRow] = await Promise.all([
    db.barVenda.aggregate({
      where: { ...base, criadoEm: { gte: inicio, lte: fim } },
      _sum: { subtotal: true, total: true },
      _count: { _all: true },
    }),
    db.barVenda.aggregate({
      where: { ...base, criadoEm: { gte: inicioAnterior, lte: fimAnterior } },
      _sum: { subtotal: true, total: true },
      _count: { _all: true },
    }),
  ])

  return { atual: aggParaResumo(atual), anterior: aggParaResumo(anterior) }
})

/**
 * Produtos ativos da unidade com estoque igual ou abaixo do mínimo.
 */
export const listarEstoqueBaixo = cache(async function listarEstoqueBaixo(
  tenantId: string,
  sedeId: string,
): Promise<BarProdutoLite[]> {
  const rows: BarProdutoLite[] = await db.barProduto.findMany({
    where: { tenantId, sedeId, ativo: true, estoqueMinimo: { not: null } },
    orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
    select: produtoSelect,
  })
  return rows.filter((p) => p.estoqueMinimo != null && p.estoque <= p.estoqueMinimo)
})

export type BarCaixaTurnoLite = {
  id: string
  abertoEm: Date
  fechadoEm: Date | null
  sangria: Prisma.Decimal
  dinheiroContado: Prisma.Decimal | null
  observacao: string | null
  abertoPor: { id: string; nome: string | null }
  fechadoPor: { id: string; nome: string | null } | null
}

export type BarTurnoResumo = {
  totalPago: number
  quantidadePaga: number
  dinheiroEsperado: number
  pendentes: number
}

/** Turno aberto da unidade (no máx. um). */
export const getTurnoAbertoBar = cache(async function getTurnoAbertoBar(
  tenantId: string,
  sedeId: string,
): Promise<BarCaixaTurnoLite | null> {
  const row: BarCaixaTurnoLite | null = await db.barCaixaTurno.findFirst({
    where: { tenantId, sedeId, fechadoEm: null },
    orderBy: { abertoEm: 'desc' },
    select: {
      id: true,
      abertoEm: true,
      fechadoEm: true,
      sangria: true,
      dinheiroContado: true,
      observacao: true,
      abertoPor: { select: { id: true, nome: true } },
      fechadoPor: { select: { id: true, nome: true } },
    },
  })
  return row
})

/** Totais do turno (vendas pagas + dinheiro esperado + pendentes). */
export const resumirTurnoBar = cache(async function resumirTurnoBar(
  tenantId: string,
  turnoId: string,
): Promise<BarTurnoResumo> {
  const whereBase: Prisma.BarVendaWhereInput = { tenantId, turnoId }

  const [pagas, pendentes, dinheiroAgg]: [
    { _sum: { total: Prisma.Decimal | null }; _count: { _all: number } },
    number,
    { _sum: { total: Prisma.Decimal | null } },
  ] = await Promise.all([
    db.barVenda.aggregate({
      where: { ...whereBase, status: 'PAGA' },
      _sum: { total: true },
      _count: { _all: true },
    }),
    db.barVenda.count({ where: { ...whereBase, status: 'PENDENTE' } }),
    db.barVenda.aggregate({
      where: { ...whereBase, status: 'PAGA', metodoPagamento: 'DINHEIRO' },
      _sum: { total: true },
    }),
  ])

  return {
    totalPago: Number(pagas._sum.total ?? 0),
    quantidadePaga: pagas._count._all,
    dinheiroEsperado: Number(dinheiroAgg._sum.total ?? 0),
    pendentes,
  }
})

export type BarMargemResumo = {
  receita: number
  custo: number
  margem: number
  quantidadeItens: number
  quantidadeVendas: number
}

/**
 * Margem estimada das vendas PAGA (Σ total − Σ custoUnit×qtd).
 * Sem schema extra — usa snapshots em BarVendaItem.
 * `sedeId` opcional: `undefined` agrega a torcida inteira (relatórios).
 */
export const resumirMargemBar = cache(async function resumirMargemBar(
  tenantId: string,
  sedeId: string | undefined,
  opts?: { desde?: Date; turnoId?: string },
): Promise<BarMargemResumo> {
  const whereVenda: Prisma.BarVendaWhereInput = {
    tenantId,
    status: 'PAGA',
  }
  if (sedeId) whereVenda.sedeId = sedeId
  if (opts?.turnoId) whereVenda.turnoId = opts.turnoId
  else if (opts?.desde) whereVenda.criadoEm = { gte: opts.desde }

  const vendas: { id: string }[] = await db.barVenda.findMany({
    where: whereVenda,
    select: { id: true },
  })
  if (vendas.length === 0) {
    return { receita: 0, custo: 0, margem: 0, quantidadeItens: 0, quantidadeVendas: 0 }
  }

  const itens: Array<{
    quantidade: number
    custoUnit: Prisma.Decimal
    total: Prisma.Decimal
  }> = await db.barVendaItem.findMany({
    where: { vendaId: { in: vendas.map((v) => v.id) } },
    select: { quantidade: true, custoUnit: true, total: true },
  })

  let receita = 0
  let custo = 0
  let quantidadeItens = 0
  for (const item of itens) {
    receita += Number(item.total)
    custo += Number(item.custoUnit) * item.quantidade
    quantidadeItens += item.quantidade
  }
  receita = Math.round(receita * 100) / 100
  custo = Math.round(custo * 100) / 100

  return {
    receita,
    custo,
    margem: Math.round((receita - custo) * 100) / 100,
    quantidadeItens,
    quantidadeVendas: vendas.length,
  }
})

/**
 * Confirma o pagamento de uma venda do bar (baixa via webhook Pix ou manual).
 * Espelha `baixarCobrancaComoPaga`: cria a RECEITA no livro-caixa dentro de
 * transação, idempotente via `financeiroLancamentoId`.
 *
 * IMPORTANTE: NÃO mexe em estoque — a baixa de estoque acontece no momento de
 * registrar a venda (PENDENTE já decrementa). Aqui só criamos a receita e
 * marcamos a venda como PAGA.
 */
export async function confirmarVendaBarPaga(input: {
  tenantId: string
  vendaId: string
  atorId?: string | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  type Row = {
    id: string
    status: StatusVendaBar
    total: Prisma.Decimal
    financeiroLancamentoId: string | null
    operadorId: string
    itens: Array<{ produtoNome: string; quantidade: number }>
  }
  const venda: Row | null = await db.barVenda.findFirst({
    where: { id: input.vendaId, tenantId: input.tenantId },
    select: {
      id: true,
      status: true,
      total: true,
      financeiroLancamentoId: true,
      operadorId: true,
      itens: { select: { produtoNome: true, quantidade: true } },
    },
  })
  if (!venda) return { ok: false, error: 'Venda não encontrada' }
  if (venda.status === 'PAGA') return { ok: true }
  if (venda.status === 'CANCELADA') return { ok: false, error: 'Venda cancelada' }
  if (venda.status === 'ESTORNADA') return { ok: false, error: 'Venda estornada' }

  const resumoItens = venda.itens
    .map((i) => `${i.produtoNome} ×${i.quantidade}`)
    .join(', ')
  const descricaoVenda =
    resumoItens.length > 0
      ? `Venda do bar — ${resumoItens}`.slice(0, 240)
      : 'Venda do bar'

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    let lancamentoId = venda.financeiroLancamentoId
    if (!lancamentoId) {
      const lanc = await tx.financeiroLancamento.create({
        data: {
          tenantId: input.tenantId,
          tipo: 'RECEITA',
          categoria: 'BAR',
          valor: venda.total,
          descricao: descricaoVenda,
          data: new Date(),
          observacao: `Pagamento PIX — venda ${venda.id}`,
          criadoPorId: input.atorId ?? venda.operadorId,
        },
        select: { id: true },
      })
      lancamentoId = lanc.id
    }

    await tx.barVenda.update({
      where: { id: venda.id },
      data: {
        status: 'PAGA',
        pagoEm: new Date(),
        financeiroLancamentoId: lancamentoId,
      },
    })
  })

  return { ok: true }
}
