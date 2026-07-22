import { cache } from 'react'
import { db } from '@torcida/db'
import type { CategoriaFinanceiroLancamento, TipoFinanceiroLancamento } from '@torcida/db'
import { Prisma } from '@torcida/db'
import {
  FINANCEIRO_PAGE_SIZE,
  formatarMoedaBRL,
  formatDataCompetenciaInput,
  METODO_PAGAMENTO_BAR_LABEL,
  parseDataCompetencia,
} from '@torcida/types'
import {
  chaveMesSP,
  resolverIntervaloPeriodo,
  ultimosMesesSP,
  type Periodo,
} from '@/lib/admin-insights'

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
  /** Filtra lançamentos do bar vinculados à unidade (SEDE/SUBSEDE/PDE). */
  sedeId?: string
}

/** IDs de lançamentos do livro-caixa ligados a vendas/compras do bar na unidade. */
async function idsLancamentosBarPorSede(tenantId: string, sedeId: string): Promise<string[]> {
  const [vendas, compras]: [
    Array<{ financeiroLancamentoId: string | null; financeiroEstornoLancamentoId: string | null }>,
    Array<{ financeiroLancamentoId: string | null }>,
  ] = await Promise.all([
    db.barVenda.findMany({
      where: { tenantId, sedeId, financeiroLancamentoId: { not: null } },
      select: { financeiroLancamentoId: true, financeiroEstornoLancamentoId: true },
    }),
    db.barMovimentacaoEstoque.findMany({
      where: { tenantId, sedeId, financeiroLancamentoId: { not: null } },
      select: { financeiroLancamentoId: true },
    }),
  ])

  const ids = new Set<string>()
  for (const v of vendas) {
    if (v.financeiroLancamentoId) ids.add(v.financeiroLancamentoId)
    if (v.financeiroEstornoLancamentoId) ids.add(v.financeiroEstornoLancamentoId)
  }
  for (const c of compras) {
    if (c.financeiroLancamentoId) ids.add(c.financeiroLancamentoId)
  }
  return [...ids]
}

async function buildWhereComSede(
  tenantId: string,
  filtro?: FinanceiroFiltro,
): Promise<Prisma.FinanceiroLancamentoWhereInput | null> {
  const where = buildWhere(tenantId, filtro)
  if (!filtro?.sedeId) return where

  const ids = await idsLancamentosBarPorSede(tenantId, filtro.sedeId)
  if (ids.length === 0) return null
  where.id = { in: ids }
  where.categoria = 'BAR'
  return where
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
  const where = await buildWhereComSede(tenantId, filtro)
  if (!where) {
    return { totalReceitas: 0, totalDespesas: 0, saldo: 0, quantidade: 0 }
  }

  const grouped: Array<{
    tipo: TipoFinanceiroLancamento
    _sum: { valor: Prisma.Decimal | null }
    _count: { _all: number }
  }> = await db.financeiroLancamento.groupBy({
    by: ['tipo'],
    where,
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

export type FinanceiroMensal = {
  mes: string
  receitas: number
  despesas: number
  saldo: number
}

/**
 * Receitas × despesas por mês (fuso São Paulo) — últimos `meses` meses, mês
 * corrente incluso. Fetch por range (índice `(tenantId, tipo, data)`) + bucket JS.
 */
export const resumirFinanceiroMensal = cache(async function resumirFinanceiroMensal(
  tenantId: string,
  meses: number,
): Promise<FinanceiroMensal[]> {
  const mesesSP = ultimosMesesSP(meses)

  const rows: Array<{ tipo: TipoFinanceiroLancamento; valor: Prisma.Decimal; data: Date }> =
    await db.financeiroLancamento.findMany({
      where: { tenantId, data: { gte: mesesSP[0].inicio } },
      select: { tipo: true, valor: true, data: true },
    })

  const porChave = new Map<string, FinanceiroMensal>(
    mesesSP.map((m) => [m.chave, { mes: m.rotulo, receitas: 0, despesas: 0, saldo: 0 }]),
  )
  for (const row of rows) {
    const bucket = porChave.get(chaveMesSP(row.data))
    if (!bucket) continue
    const valor = toNumber(row.valor)
    if (row.tipo === 'RECEITA') bucket.receitas += valor
    else bucket.despesas += valor
    bucket.saldo = bucket.receitas - bucket.despesas
  }

  return [...porChave.values()]
})

/** Resumo do período vs período imediatamente anterior (comparativos/TrendDelta). */
export const compararFinanceiroPeriodo = cache(async function compararFinanceiroPeriodo(
  tenantId: string,
  periodo: Periodo,
): Promise<{ atual: FinanceiroResumo; anterior: FinanceiroResumo }> {
  const { inicio, fim, inicioAnterior, fimAnterior } = resolverIntervaloPeriodo(periodo)

  const [atual, anterior]: [FinanceiroResumo, FinanceiroResumo] = await Promise.all([
    resumirFinanceiro(tenantId, {
      dataDe: formatDataCompetenciaInput(inicio),
      dataAte: formatDataCompetenciaInput(fim),
    }),
    resumirFinanceiro(tenantId, {
      dataDe: formatDataCompetenciaInput(inicioAnterior),
      dataAte: formatDataCompetenciaInput(fimAnterior),
    }),
  ])

  return { atual, anterior }
})

export type FinanceiroCategoriaResumo = {
  categoria: CategoriaFinanceiroLancamento
  receitas: number
  despesas: number
  saldo: number
}

/** Agregados por categoria — resumo no Balanço (acima da lista detalhada). */
export const resumirFinanceiroPorCategoria = cache(async function resumirFinanceiroPorCategoria(
  tenantId: string,
  filtro?: FinanceiroFiltro,
): Promise<FinanceiroCategoriaResumo[]> {
  const where = await buildWhereComSede(tenantId, filtro)
  if (!where) return []

  const grouped: Array<{
    tipo: TipoFinanceiroLancamento
    categoria: CategoriaFinanceiroLancamento
    _sum: { valor: Prisma.Decimal | null }
  }> = await db.financeiroLancamento.groupBy({
    by: ['tipo', 'categoria'],
    where,
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

export type BalancoItemLinha = {
  nome: string
  quantidade: number
  precoUnit: number
  total: number
}

export type BalancoLancamentoDetalhe = {
  id: string
  tipo: TipoFinanceiroLancamento
  categoria: CategoriaFinanceiroLancamento
  valor: number
  descricao: string
  data: Date
  observacao: string | null
  /** Quem registrou o lançamento no livro-caixa. */
  criadoPorNome: string | null
  /** Quem operou a venda/compra (bar) ou quem registrou (fallback). */
  pessoaNome: string | null
  /** Departamento(s) do membro no momento da consulta. */
  departamentoNome: string | null
  /** Unidade (SEDE / SUBSEDE / PDE) — típico do bar. */
  unidadeNome: string | null
  metodoPagamentoLabel: string | null
  itens: BalancoItemLinha[] | null
  origem: 'BAR_VENDA' | 'BAR_COMPRA' | 'COBRANCA' | 'MANUAL'
}

type BarVendaVinculada = {
  financeiroLancamentoId: string | null
  metodoPagamento: string
  observacao: string | null
  desconto: Prisma.Decimal
  operador: { id: string; nome: string | null }
  sede: { nome: string; tipo: string }
  itens: Array<{
    produtoNome: string
    quantidade: number
    precoUnit: Prisma.Decimal
    total: Prisma.Decimal
  }>
}

type BarCompraVinculada = {
  financeiroLancamentoId: string | null
  quantidade: number
  custoTotal: Prisma.Decimal | null
  motivo: string | null
  produto: { nome: string }
  operador: { id: string; nome: string | null } | null
  sede: { nome: string; tipo: string }
}

type CobrancaVinculada = {
  financeiroLancamentoId: string | null
  descricao: string
  metodoPagamento: string | null
  user: { nome: string | null }
  membro: { nome: string; departamento: { nome: string } | null } | null
}

const TIPO_SEDE_CURTO: Record<string, string> = {
  SEDE: 'Sede',
  SUBSEDE: 'Subsede',
  PONTO_ENCONTRO: 'PDE',
}

function rotuloUnidade(sede: { nome: string; tipo: string }): string {
  const tipo = TIPO_SEDE_CURTO[sede.tipo] ?? sede.tipo
  return `${sede.nome} (${tipo})`
}

/**
 * Lançamentos individuais para o Balanço público — com itens do bar,
 * unidade, departamento e pessoa (vendedor/registrante).
 */
export const listarLancamentosBalanco = cache(async function listarLancamentosBalanco(
  tenantId: string,
  opts?: { filtro?: FinanceiroFiltro; pageSize?: number },
): Promise<{
  itens: BalancoLancamentoDetalhe[]
  page: number
  pageSize: number
  total: number
}> {
  const pageSize = opts?.pageSize ?? FINANCEIRO_PAGE_SIZE
  const page = Math.max(1, opts?.filtro?.page ?? 1)
  const where = await buildWhereComSede(tenantId, opts?.filtro)
  if (!where) {
    return { itens: [], page, pageSize, total: 0 }
  }

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

  if (rows.length === 0) {
    return { itens: [], page, pageSize, total }
  }

  const ids = rows.map((r) => r.id)

  const [vendas, compras, cobrancas]: [
    BarVendaVinculada[],
    BarCompraVinculada[],
    CobrancaVinculada[],
  ] = await Promise.all([
    db.barVenda.findMany({
      where: { tenantId, financeiroLancamentoId: { in: ids } },
      select: {
        financeiroLancamentoId: true,
        metodoPagamento: true,
        observacao: true,
        desconto: true,
        operador: { select: { id: true, nome: true } },
        sede: { select: { nome: true, tipo: true } },
        itens: {
          select: {
            produtoNome: true,
            quantidade: true,
            precoUnit: true,
            total: true,
          },
        },
      },
    }),
    db.barMovimentacaoEstoque.findMany({
      where: {
        tenantId,
        financeiroLancamentoId: { in: ids },
        tipo: 'ENTRADA',
      },
      select: {
        financeiroLancamentoId: true,
        quantidade: true,
        custoTotal: true,
        motivo: true,
        produto: { select: { nome: true } },
        operador: { select: { id: true, nome: true } },
        sede: { select: { nome: true, tipo: true } },
      },
    }),
    db.cobrancaAssociacao.findMany({
      where: { tenantId, financeiroLancamentoId: { in: ids } },
      select: {
        financeiroLancamentoId: true,
        descricao: true,
        metodoPagamento: true,
        user: { select: { nome: true } },
        membro: {
          select: {
            nome: true,
            departamento: { select: { nome: true } },
          },
        },
      },
    }),
  ])

  const vendaPorLanc = new Map<string, BarVendaVinculada>()
  for (const v of vendas) {
    if (v.financeiroLancamentoId) vendaPorLanc.set(v.financeiroLancamentoId, v)
  }
  const compraPorLanc = new Map<string, BarCompraVinculada>()
  for (const c of compras) {
    if (c.financeiroLancamentoId) compraPorLanc.set(c.financeiroLancamentoId, c)
  }
  const cobPorLanc = new Map<string, CobrancaVinculada>()
  for (const c of cobrancas) {
    if (c.financeiroLancamentoId) cobPorLanc.set(c.financeiroLancamentoId, c)
  }

  const userIds = new Set<string>()
  for (const r of rows) userIds.add(r.criadoPor.id)
  for (const v of vendas) userIds.add(v.operador.id)
  for (const c of compras) {
    if (c.operador) userIds.add(c.operador.id)
  }

  type DeptoRow = { userId: string; departamento: { nome: string } }
  const deptos: DeptoRow[] =
    userIds.size === 0
      ? []
      : await db.userDepartamento.findMany({
          where: { tenantId, userId: { in: [...userIds] } },
          select: {
            userId: true,
            departamento: { select: { nome: true } },
          },
          orderBy: { criadoEm: 'asc' },
        })

  const deptosPorUser = new Map<string, string[]>()
  for (const d of deptos) {
    const lista = deptosPorUser.get(d.userId) ?? []
    if (!lista.includes(d.departamento.nome)) lista.push(d.departamento.nome)
    deptosPorUser.set(d.userId, lista)
  }

  const itens: BalancoLancamentoDetalhe[] = rows.map((r) => {
    const venda = vendaPorLanc.get(r.id)
    const compra = compraPorLanc.get(r.id)
    const cob = cobPorLanc.get(r.id)

    let origem: BalancoLancamentoDetalhe['origem'] = 'MANUAL'
    let pessoaNome = r.criadoPor.nome
    let pessoaId = r.criadoPor.id
    let unidadeNome: string | null = null
    let metodoPagamentoLabel: string | null = null
    let itensLinha: BalancoItemLinha[] | null = null
    let observacao = r.observacao
    let departamentoNome: string | null = null

    if (venda) {
      origem = 'BAR_VENDA'
      pessoaNome = venda.operador.nome ?? r.criadoPor.nome
      pessoaId = venda.operador.id
      unidadeNome = rotuloUnidade(venda.sede)
      metodoPagamentoLabel =
        METODO_PAGAMENTO_BAR_LABEL[venda.metodoPagamento] ?? venda.metodoPagamento
      itensLinha = venda.itens.map((i) => ({
        nome: i.produtoNome,
        quantidade: i.quantidade,
        precoUnit: toNumber(i.precoUnit),
        total: toNumber(i.total),
      }))
      if (!observacao && venda.observacao) observacao = venda.observacao
      if (toNumber(venda.desconto) > 0) {
        const desc = `Desconto ${formatarMoedaBRL(toNumber(venda.desconto))}`
        observacao = observacao ? `${observacao} · ${desc}` : desc
      }
    } else if (compra) {
      origem = 'BAR_COMPRA'
      pessoaNome = compra.operador?.nome ?? r.criadoPor.nome
      pessoaId = compra.operador?.id ?? r.criadoPor.id
      unidadeNome = rotuloUnidade(compra.sede)
      itensLinha = [
        {
          nome: compra.produto.nome,
          quantidade: compra.quantidade,
          precoUnit:
            compra.custoTotal != null && compra.quantidade > 0
              ? toNumber(compra.custoTotal) / compra.quantidade
              : 0,
          total: compra.custoTotal != null ? toNumber(compra.custoTotal) : toNumber(r.valor),
        },
      ]
      if (!observacao && compra.motivo) observacao = compra.motivo
    } else if (cob) {
      origem = 'COBRANCA'
      pessoaNome = cob.membro?.nome ?? cob.user.nome ?? r.criadoPor.nome
      if (cob.membro?.departamento?.nome) {
        departamentoNome = cob.membro.departamento.nome
      }
      if (cob.metodoPagamento) {
        metodoPagamentoLabel = cob.metodoPagamento.replace(/_/g, ' ')
      }
    }

    if (!departamentoNome) {
      const nomes = deptosPorUser.get(pessoaId)
      if (nomes && nomes.length > 0) departamentoNome = nomes.join(' · ')
    }

    // Fallback: área financeira (categoria) quando não há vínculo de departamento.
    if (!departamentoNome && r.categoria === 'BAR') {
      departamentoNome = 'Bar'
    }

    return {
      id: r.id,
      tipo: r.tipo,
      categoria: r.categoria,
      valor: toNumber(r.valor),
      descricao: r.descricao,
      data: r.data,
      observacao,
      criadoPorNome: r.criadoPor.nome,
      pessoaNome,
      departamentoNome,
      unidadeNome,
      metodoPagamentoLabel,
      itens: itensLinha,
      origem,
    }
  })

  return { itens, page, pageSize, total }
})

export { formatarMoedaBRL }
