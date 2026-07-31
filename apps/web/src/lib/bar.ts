import 'server-only'

import { cache } from 'react'
import { db } from '@torcida/db'
import type {
  MetodoPagamentoBar,
  StatusFiadoBar,
  StatusVendaBar,
  TipoMovEstoqueBar,
  TipoSede,
} from '@torcida/db'
import { Prisma } from '@torcida/db'
import {
  BAR_PAGE_SIZE,
  LIMIAR_DIVERGENCIA_ABS,
  LIMIAR_DIVERGENCIA_PCT,
  montarResumoRecebidoBar,
  somarConsumoEmAbertoBar,
} from '@torcida/types'
import {
  bucketSomaPorDia,
  resolverIntervaloPeriodo,
  type Periodo,
  type SerieTemporal,
} from '@/lib/admin-insights'

/** Reexportados de `@torcida/types` para manter os call sites existentes (`@/lib/bar`). */
export { LIMIAR_DIVERGENCIA_ABS, LIMIAR_DIVERGENCIA_PCT }
/** Quantidade de estornos do mesmo operador na janela abaixo que caracteriza anomalia. */
export const LIMIAR_ESTORNOS_ANOMALO = 3
/** Janela (em dias) considerada na contagem de estornos por operador. */
export const JANELA_ESTORNOS_ANOMALO_DIAS = 30

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
  fiado: { status: StatusFiadoBar } | null
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
        fiado: { select: { status: true } },
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

/**
 * Where de venda rápida PAGA (sem comanda). Recebido ≠ lançamento EM_COMANDA.
 * @see docs/data/modulo-bar-comanda.md §5.8 item 33
 */
function whereVendaRapidaPaga(
  tenantId: string,
  sedeId: string | undefined,
  criadoRange?: { gte?: Date; lte?: Date },
): Prisma.BarVendaWhereInput {
  const where: Prisma.BarVendaWhereInput = {
    tenantId,
    status: 'PAGA',
    comandaId: null,
  }
  if (sedeId) where.sedeId = sedeId
  if (criadoRange) where.criadoEm = criadoRange
  return where
}

/**
 * Where de pagamento de comanda CONFIRMADO. Data = `recebidoEm` (não `pagoEm`).
 */
function wherePagamentoComandaConfirmado(
  tenantId: string,
  sedeId: string | undefined,
  recebidoRange?: { gte?: Date; lte?: Date },
): Prisma.BarComandaPagamentoWhereInput {
  const comanda: Prisma.BarComandaWhereInput = { tenantId }
  if (sedeId) comanda.sedeId = sedeId
  const where: Prisma.BarComandaPagamentoWhereInput = {
    status: 'CONFIRMADO',
    comanda: { is: comanda },
  }
  if (recebidoRange) where.recebidoEm = recebidoRange
  return where
}

async function agregarRecebidoBar(
  tenantId: string,
  sedeId: string | undefined,
  range?: { gte?: Date; lte?: Date },
): Promise<BarVendasResumo> {
  const [vendasAgg, pagAgg]: [
    { _sum: { total: Prisma.Decimal | null }; _count: { _all: number } },
    { _sum: { valor: Prisma.Decimal | null }; _count: { _all: number } },
  ] = await Promise.all([
    db.barVenda.aggregate({
      where: whereVendaRapidaPaga(tenantId, sedeId, range),
      _sum: { total: true },
      _count: { _all: true },
    }),
    db.barComandaPagamento.aggregate({
      where: wherePagamentoComandaConfirmado(tenantId, sedeId, range),
      _sum: { valor: true },
      _count: { _all: true },
    }),
  ])

  return montarResumoRecebidoBar({
    vendasRapidasTotal: Number(vendasAgg._sum.total ?? 0),
    vendasRapidasCount: vendasAgg._count._all,
    pagamentosComandaTotal: Number(pagAgg._sum.valor ?? 0),
    pagamentosComandaCount: pagAgg._count._all,
  })
}

/**
 * Recebido = vendas rápidas PAGA (sem comandaId) + BarComandaPagamento CONFIRMADO
 * no período (`recebidoEm`). Não conta EM_COMANDA.
 *
 * Alias histórico: `resumirVendasBar` — `totalPago` = Recebido; `quantidade` =
 * nº de eventos (vendas rápidas + pagamentos).
 */
export const resumirRecebidoBar = cache(async function resumirRecebidoBar(
  tenantId: string,
  sedeId?: string,
  opts?: { desde?: Date; ate?: Date },
): Promise<BarVendasResumo> {
  const range =
    opts?.desde || opts?.ate
      ? { ...(opts.desde ? { gte: opts.desde } : {}), ...(opts.ate ? { lte: opts.ate } : {}) }
      : undefined
  return agregarRecebidoBar(tenantId, sedeId, range)
})

/**
 * @deprecated Preferir `resumirRecebidoBar` — mantido como alias com sede obrigatória
 * (hub da unidade). Semântica = Recebido (§5.8.33).
 */
export const resumirVendasBar = cache(async function resumirVendasBar(
  tenantId: string,
  sedeId: string,
  opts?: { desde?: Date },
): Promise<BarVendasResumo> {
  return resumirRecebidoBar(tenantId, sedeId, opts)
})

export type BarConsumoEmAbertoResumo = {
  /** Soma de (total − desconto) das comandas ABERTA — snapshot atual. */
  total: number
  quantidade: number
}

/**
 * Consumo em aberto: snapshot das comandas ABERTA (não é série temporal).
 * Spec §5.8.33 — separado de Recebido.
 */
export const resumirConsumoEmAbertoBar = cache(async function resumirConsumoEmAbertoBar(
  tenantId: string,
  sedeId?: string,
): Promise<BarConsumoEmAbertoResumo> {
  const where: Prisma.BarComandaWhereInput = { tenantId, status: 'ABERTA' }
  if (sedeId) where.sedeId = sedeId

  const rows: Array<{ total: Prisma.Decimal; desconto: Prisma.Decimal }> =
    await db.barComanda.findMany({
      where,
      select: { total: true, desconto: true },
    })

  return {
    total: somarConsumoEmAbertoBar(
      rows.map((r) => ({ total: Number(r.total), desconto: Number(r.desconto) })),
    ),
    quantidade: rows.length,
  }
})

/**
 * Recebido por dia (vendas rápidas + pagamentos CONFIRMADO via `recebidoEm`).
 * Sem `sedeId` = torcida inteira (relatórios); com `sedeId` = unidade.
 */
export const resumirVendasBarPorDia = cache(async function resumirVendasBarPorDia(
  tenantId: string,
  dias: number,
  sedeId?: string,
): Promise<SerieTemporal> {
  const fim = new Date()
  const inicio = new Date(fim.getTime() - dias * 24 * 60 * 60 * 1000)
  const range = { gte: inicio }

  const [vendas, pagamentos]: [
    Array<{ criadoEm: Date; total: Prisma.Decimal }>,
    Array<{ recebidoEm: Date; valor: Prisma.Decimal }>,
  ] = await Promise.all([
    db.barVenda.findMany({
      where: whereVendaRapidaPaga(tenantId, sedeId, range),
      select: { criadoEm: true, total: true },
    }),
    db.barComandaPagamento.findMany({
      where: wherePagamentoComandaConfirmado(tenantId, sedeId, range),
      select: { recebidoEm: true, valor: true },
    }),
  ])

  return bucketSomaPorDia(
    [
      ...vendas.map((r) => ({ data: r.criadoEm, valor: Number(r.total) })),
      ...pagamentos.map((r) => ({ data: r.recebidoEm, valor: Number(r.valor) })),
    ],
    inicio,
    fim,
  )
})

export type BarMaisVendido = {
  produtoNome: string
  quantidade: number
  receita: number
}

/**
 * Top 5 produtos por quantidade consumida (PAGA rápida ou EM_COMANDA) no período.
 * Label UI: "Mais consumidos" — produto saiu, independente de Recebido.
 */
export const listarMaisVendidosBar = cache(async function listarMaisVendidosBar(
  tenantId: string,
  periodo: Periodo,
  sedeId?: string,
): Promise<BarMaisVendido[]> {
  const { inicio, fim } = resolverIntervaloPeriodo(periodo)
  const whereVenda: Prisma.BarVendaWhereInput = {
    tenantId,
    status: { in: ['PAGA', 'EM_COMANDA'] },
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

/** Recebido do período vs período imediatamente anterior (TrendDelta). */
export const compararVendasBarPeriodo = cache(async function compararVendasBarPeriodo(
  tenantId: string,
  periodo: Periodo,
  sedeId?: string,
): Promise<BarVendasComparativo> {
  const { inicio, fim, inicioAnterior, fimAnterior } = resolverIntervaloPeriodo(periodo)

  const [atual, anterior]: [BarVendasResumo, BarVendasResumo] = await Promise.all([
    agregarRecebidoBar(tenantId, sedeId, { gte: inicio, lte: fim }),
    agregarRecebidoBar(tenantId, sedeId, { gte: inicioAnterior, lte: fimAnterior }),
  ])

  return { atual, anterior }
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

  const [pagas, pendentes, dinheiroVendasAgg, dinheiroComandaAgg]: [
    { _sum: { total: Prisma.Decimal | null }; _count: { _all: number } },
    number,
    { _sum: { total: Prisma.Decimal | null } },
    { _sum: { valor: Prisma.Decimal | null } },
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
    // Pagamentos de comanda em dinheiro confirmados neste turno (§5.9).
    db.barComandaPagamento.aggregate({
      where: {
        turnoId,
        status: 'CONFIRMADO',
        metodoPagamento: 'DINHEIRO',
        comanda: { tenantId },
      },
      _sum: { valor: true },
    }),
  ])

  const dinheiroEsperado =
    Number(dinheiroVendasAgg._sum.total ?? 0) + Number(dinheiroComandaAgg._sum.valor ?? 0)

  return {
    totalPago: Number(pagas._sum.total ?? 0),
    quantidadePaga: pagas._count._all,
    dinheiroEsperado,
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
 * Margem estimada do consumo (Σ total − Σ custoUnit×qtd) em vendas PAGA **e**
 * EM_COMANDA — o produto saiu. `receita` aqui = consumo, não "Recebido".
 * `sedeId` opcional: `undefined` agrega a torcida inteira (relatórios).
 */
export const resumirMargemBar = cache(async function resumirMargemBar(
  tenantId: string,
  sedeId: string | undefined,
  opts?: { desde?: Date; turnoId?: string },
): Promise<BarMargemResumo> {
  const whereVenda: Prisma.BarVendaWhereInput = {
    tenantId,
    status: { in: ['PAGA', 'EM_COMANDA'] },
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

export type BarFornecedorLite = {
  id: string
  nome: string
  contato: string | null
  documento: string | null
  observacao: string | null
  ativo: boolean
  criadoEm: Date
}

/** Fornecedores de insumo do tenant (usado no formulário de compra e no CRUD). */
export const listarFornecedoresBar = cache(async function listarFornecedoresBar(
  tenantId: string,
  opts?: { apenasAtivos?: boolean },
): Promise<BarFornecedorLite[]> {
  const where: Prisma.BarFornecedorWhereInput = { tenantId }
  if (opts?.apenasAtivos) where.ativo = true

  const rows: BarFornecedorLite[] = await db.barFornecedor.findMany({
    where,
    orderBy: { nome: 'asc' },
    select: {
      id: true,
      nome: true,
      contato: true,
      documento: true,
      observacao: true,
      ativo: true,
      criadoEm: true,
    },
  })
  return rows
})

export type BarMembroParaFiadoLite = {
  id: string
  membroId: string
  nome: string
  email: string | null
}

/**
 * Membros aprovados da unidade — fiado legado e titular de comanda MEMBRO no PDV.
 * Alias: `listarMembrosParaComanda`.
 */
export const listarMembrosParaFiado = cache(async function listarMembrosParaFiado(
  tenantId: string,
  sedeId: string,
): Promise<BarMembroParaFiadoLite[]> {
  const rows: Array<{
    id: string
    userId: string
    nome: string
    user: { email: string | null }
  }> = await db.saasMembro.findMany({
    where: { tenantId, sedeId, status: 'APROVADO' },
    orderBy: { nome: 'asc' },
    select: {
      id: true,
      userId: true,
      nome: true,
      user: { select: { email: true } },
    },
  })

  return rows.map((r) => ({ id: r.userId, membroId: r.id, nome: r.nome, email: r.user.email }))
})

/** Alias PDV — mesmo conjunto APROVADO da unidade (titular de comanda MEMBRO). */
export const listarMembrosParaComanda = listarMembrosParaFiado

export type BarMovimentacaoEstoqueLite = {
  id: string
  produtoId: string
  produtoNome: string
  tipo: TipoMovEstoqueBar
  quantidade: number
  custoTotal: Prisma.Decimal | null
  motivo: string | null
  criadoEm: Date
  fornecedor: { id: string; nome: string } | null
  operador: { id: string; nome: string | null } | null
}

/** Últimas movimentações de estoque da unidade (entrada/saída/ajuste), com fornecedor. */
export const listarMovimentacoesEstoqueBar = cache(async function listarMovimentacoesEstoqueBar(
  tenantId: string,
  sedeId: string,
  opts?: { take?: number },
): Promise<BarMovimentacaoEstoqueLite[]> {
  const rows: Array<{
    id: string
    tipo: TipoMovEstoqueBar
    quantidade: number
    custoTotal: Prisma.Decimal | null
    motivo: string | null
    criadoEm: Date
    produto: { id: string; nome: string }
    fornecedor: { id: string; nome: string } | null
    operador: { id: string; nome: string | null } | null
  }> = await db.barMovimentacaoEstoque.findMany({
    where: { tenantId, sedeId },
    orderBy: { criadoEm: 'desc' },
    take: opts?.take ?? 20,
    select: {
      id: true,
      tipo: true,
      quantidade: true,
      custoTotal: true,
      motivo: true,
      criadoEm: true,
      produto: { select: { id: true, nome: true } },
      fornecedor: { select: { id: true, nome: true } },
      operador: { select: { id: true, nome: true } },
    },
  })

  return rows.map((r) => ({
    id: r.id,
    produtoId: r.produto.id,
    produtoNome: r.produto.nome,
    tipo: r.tipo,
    quantidade: r.quantidade,
    custoTotal: r.custoTotal,
    motivo: r.motivo,
    criadoEm: r.criadoEm,
    fornecedor: r.fornecedor,
    operador: r.operador,
  }))
})

export type BarFiadoLite = {
  id: string
  valor: Prisma.Decimal
  vencimento: Date
  status: StatusFiadoBar
  pagoEm: Date | null
  criadoEm: Date
  devedorNome: string | null
}

/**
 * Fiados da unidade, mais recentes primeiro. `PENDENTE`/`VENCIDA` primeiro
 * (para a fila de cobrança), depois `PAGA`/`CANCELADA`.
 */
export const listarFiadosBar = cache(async function listarFiadosBar(
  tenantId: string,
  sedeId: string,
): Promise<BarFiadoLite[]> {
  const rows: Array<{
    id: string
    valor: Prisma.Decimal
    vencimento: Date
    status: StatusFiadoBar
    pagoEm: Date | null
    criadoEm: Date
    membro: { nome: string } | null
    user: { nome: string | null }
  }> = await db.barFiado.findMany({
    where: { tenantId, sedeId },
    orderBy: { criadoEm: 'desc' },
    select: {
      id: true,
      valor: true,
      vencimento: true,
      status: true,
      pagoEm: true,
      criadoEm: true,
      membro: { select: { nome: true } },
      user: { select: { nome: true } },
    },
  })

  const prioridade: Record<StatusFiadoBar, number> = { VENCIDA: 0, PENDENTE: 1, PAGA: 2, CANCELADA: 3 }
  return rows
    .map((r) => ({
      id: r.id,
      valor: r.valor,
      vencimento: r.vencimento,
      status: r.status,
      pagoEm: r.pagoEm,
      criadoEm: r.criadoEm,
      devedorNome: r.membro?.nome ?? r.user.nome,
    }))
    .sort((a, b) => prioridade[a.status] - prioridade[b.status])
})

export type BarEstornoLite = {
  id: string
  subtotal: Prisma.Decimal
  desconto: Prisma.Decimal
  total: Prisma.Decimal
  metodoPagamento: MetodoPagamentoBar
  criadoEm: Date
  estornadoEm: Date | null
  motivoEstorno: string | null
  operador: { id: string; nome: string | null }
  estornadoPor: { id: string; nome: string | null } | null
  itens: BarVendaItemLite[]
}

export type BarEstornoAgregadoOperador = {
  operadorId: string
  operadorNome: string | null
  quantidade: number
  valorTotal: number
}

export type BarEstornoAgregadoProduto = {
  produtoId: string | null
  produtoNome: string
  quantidade: number
  valorTotal: number
}

export type BarEstornosResumo = {
  vendas: BarEstornoLite[]
  porOperador: BarEstornoAgregadoOperador[]
  porProduto: BarEstornoAgregadoProduto[]
}

/** Estornos da unidade no período — lista bruta + agregações por operador/produto. */
export const listarEstornosBar = cache(async function listarEstornosBar(
  tenantId: string,
  sedeId: string,
  periodo: { de: Date; ate: Date },
): Promise<BarEstornosResumo> {
  const vendas: BarEstornoLite[] = await db.barVenda.findMany({
    where: {
      tenantId,
      sedeId,
      status: 'ESTORNADA',
      estornadoEm: { gte: periodo.de, lte: periodo.ate },
    },
    orderBy: { estornadoEm: 'desc' },
    select: {
      id: true,
      subtotal: true,
      desconto: true,
      total: true,
      metodoPagamento: true,
      criadoEm: true,
      estornadoEm: true,
      motivoEstorno: true,
      operador: { select: { id: true, nome: true } },
      estornadoPor: { select: { id: true, nome: true } },
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
  })

  const porOperadorMap = new Map<string, BarEstornoAgregadoOperador>()
  for (const venda of vendas) {
    const atual = porOperadorMap.get(venda.operador.id) ?? {
      operadorId: venda.operador.id,
      operadorNome: venda.operador.nome,
      quantidade: 0,
      valorTotal: 0,
    }
    atual.quantidade += 1
    atual.valorTotal = Math.round((atual.valorTotal + Number(venda.total)) * 100) / 100
    porOperadorMap.set(venda.operador.id, atual)
  }

  const porProdutoMap = new Map<string, BarEstornoAgregadoProduto>()
  for (const venda of vendas) {
    for (const item of venda.itens) {
      const chave = item.produtoId ?? `avulso:${item.produtoNome}`
      const atual = porProdutoMap.get(chave) ?? {
        produtoId: item.produtoId,
        produtoNome: item.produtoNome,
        quantidade: 0,
        valorTotal: 0,
      }
      atual.quantidade += item.quantidade
      atual.valorTotal = Math.round((atual.valorTotal + Number(item.total)) * 100) / 100
      porProdutoMap.set(chave, atual)
    }
  }

  return {
    vendas,
    porOperador: Array.from(porOperadorMap.values()).sort((a, b) => b.quantidade - a.quantidade),
    porProduto: Array.from(porProdutoMap.values()).sort((a, b) => b.quantidade - a.quantidade),
  }
})
