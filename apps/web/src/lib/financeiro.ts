import { cache } from 'react'
import { db } from '@torcida/db'
import type { CategoriaFinanceiroLancamento, TipoFinanceiroLancamento } from '@torcida/db'
import { Prisma } from '@torcida/db'
import { FINANCEIRO_PAGE_SIZE, parseDataCompetencia } from '@torcida/types'

export type FinanceiroLancamentoLite = {
  id: string
  tipo: TipoFinanceiroLancamento
  categoria: CategoriaFinanceiroLancamento
  valor: Prisma.Decimal
  descricao: string
  data: Date
  observacao: string | null
  criadoEm: Date
  atualizadoEm: Date
  criadoPor: { id: string; nome: string | null }
}

export type FinanceiroResumo = {
  totalReceitas: number
  totalDespesas: number
  saldo: number
  quantidade: number
}

export type FinanceiroFiltro = {
  tipo?: TipoFinanceiroLancamento
  categoria?: CategoriaFinanceiroLancamento
  q?: string
  dataDe?: string
  dataAte?: string
  page?: number
}

function toNumber(v: Prisma.Decimal | number): number {
  return typeof v === 'number' ? v : Number(v)
}

function buildWhere(
  tenantId: string,
  filtro?: FinanceiroFiltro,
): Prisma.FinanceiroLancamentoWhereInput {
  const where: Prisma.FinanceiroLancamentoWhereInput = { tenantId }
  if (!filtro) return where

  if (filtro.tipo) where.tipo = filtro.tipo
  if (filtro.categoria) where.categoria = filtro.categoria
  if (filtro.q) {
    where.OR = [
      { descricao: { contains: filtro.q, mode: 'insensitive' } },
      { observacao: { contains: filtro.q, mode: 'insensitive' } },
    ]
  }
  const de = filtro.dataDe ? parseDataCompetencia(filtro.dataDe) : null
  const ate = filtro.dataAte ? parseDataCompetencia(filtro.dataAte) : null
  if (de || ate) {
    where.data = {}
    if (de) where.data.gte = de
    if (ate) {
      const fim = new Date(ate)
      fim.setHours(23, 59, 59, 999)
      where.data.lte = fim
    }
  }
  return where
}

export const resumirFinanceiro = cache(async function resumirFinanceiro(
  tenantId: string,
  filtro?: FinanceiroFiltro,
): Promise<FinanceiroResumo> {
  const grouped: Array<{
    tipo: TipoFinanceiroLancamento
    _sum: { valor: Prisma.Decimal | null }
    _count: { _all: number }
  }> = await db.financeiroLancamento.groupBy({
    by: ['tipo'],
    where: buildWhere(tenantId, filtro),
    _sum: { valor: true },
    _count: { _all: true },
  })

  let totalReceitas = 0
  let totalDespesas = 0
  let quantidade = 0
  for (const row of grouped) {
    const soma = toNumber(row._sum.valor ?? 0)
    quantidade += row._count._all
    if (row.tipo === 'RECEITA') totalReceitas += soma
    else totalDespesas += soma
  }

  return {
    totalReceitas,
    totalDespesas,
    saldo: totalReceitas - totalDespesas,
    quantidade,
  }
})

export type FinanceiroCategoriaResumo = {
  categoria: CategoriaFinanceiroLancamento
  receitas: number
  despesas: number
  saldo: number
}

/** Agregados por categoria (sem lançamentos individuais) — página Balanço. */
export const resumirFinanceiroPorCategoria = cache(async function resumirFinanceiroPorCategoria(
  tenantId: string,
  filtro?: FinanceiroFiltro,
): Promise<FinanceiroCategoriaResumo[]> {
  const grouped: Array<{
    tipo: TipoFinanceiroLancamento
    categoria: CategoriaFinanceiroLancamento
    _sum: { valor: Prisma.Decimal | null }
  }> = await db.financeiroLancamento.groupBy({
    by: ['tipo', 'categoria'],
    where: buildWhere(tenantId, filtro),
    _sum: { valor: true },
  })

  const mapa = new Map<CategoriaFinanceiroLancamento, FinanceiroCategoriaResumo>()
  for (const row of grouped) {
    const atual = mapa.get(row.categoria) ?? {
      categoria: row.categoria,
      receitas: 0,
      despesas: 0,
      saldo: 0,
    }
    const soma = toNumber(row._sum.valor ?? 0)
    if (row.tipo === 'RECEITA') atual.receitas += soma
    else atual.despesas += soma
    atual.saldo = atual.receitas - atual.despesas
    mapa.set(row.categoria, atual)
  }

  return [...mapa.values()].sort((a, b) => Math.abs(b.saldo) - Math.abs(a.saldo))
})

export const listarLancamentosFinanceiro = cache(async function listarLancamentosFinanceiro(
  tenantId: string,
  opts?: { filtro?: FinanceiroFiltro; pageSize?: number },
): Promise<{ itens: FinanceiroLancamentoLite[]; page: number; pageSize: number; total: number }> {
  const pageSize = opts?.pageSize ?? FINANCEIRO_PAGE_SIZE
  const page = Math.max(1, opts?.filtro?.page ?? 1)
  const where = buildWhere(tenantId, opts?.filtro)

  const [total, rows]: [number, FinanceiroLancamentoLite[]] = await Promise.all([
    db.financeiroLancamento.count({ where }),
    db.financeiroLancamento.findMany({
      where,
      orderBy: [{ data: 'desc' }, { criadoEm: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        tipo: true,
        categoria: true,
        valor: true,
        descricao: true,
        data: true,
        observacao: true,
        criadoEm: true,
        atualizadoEm: true,
        criadoPor: { select: { id: true, nome: true } },
      },
    }),
  ])

  return { itens: rows, page, pageSize, total }
})

/** Painel do departamento: resumo + últimos lançamentos (cacheado por request). */
export const carregarPainelFinanceiro = cache(async function carregarPainelFinanceiro(
  tenantId: string,
  recentes = 5,
): Promise<{ resumo: FinanceiroResumo; recentes: FinanceiroLancamentoLite[] }> {
  const [resumo, lista] = await Promise.all([
    resumirFinanceiro(tenantId),
    listarLancamentosFinanceiro(tenantId, {
      pageSize: recentes,
      filtro: { page: 1 },
    }),
  ])
  return { resumo, recentes: lista.itens }
})

export { formatarMoedaBRL } from '@torcida/types'
