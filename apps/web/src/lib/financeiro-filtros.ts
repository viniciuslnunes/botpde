import { FiltroFinanceiroSchema, formatDataCompetenciaInput } from '@torcida/types'
import { z } from 'zod'
import type { FinanceiroFiltro } from '@/lib/financeiro'

export type FinanceiroSearchParams = {
  tipo?: string
  categoria?: string
  q?: string
  dataDe?: string
  dataAte?: string
  page?: string
  sedeId?: string
}

export type FinanceiroFiltroValues = {
  tipo?: string
  categoria?: string
  q?: string
  dataDe?: string
  dataAte?: string
  sedeId?: string
}

export function parseFiltroFinanceiro(sp: FinanceiroSearchParams): {
  filtro: FinanceiroFiltro
  values: FinanceiroFiltroValues
} {
  const parsed = FiltroFinanceiroSchema.safeParse({
    tipo: sp.tipo || undefined,
    categoria: sp.categoria || undefined,
    q: sp.q || undefined,
    dataDe: sp.dataDe || undefined,
    dataAte: sp.dataAte || undefined,
    page: sp.page || 1,
  })

  if (!parsed.success) {
    return { filtro: { page: 1 }, values: {} }
  }

  const { tipo, categoria, q, dataDe, dataAte, page } = parsed.data
  return {
    filtro: { tipo, categoria, q, dataDe, dataAte, page },
    values: {
      tipo,
      categoria,
      q,
      dataDe,
      dataAte,
    },
  }
}

/** Só período + unidade (balanço público). */
export function parseFiltroBalanco(sp: {
  dataDe?: string
  dataAte?: string
  page?: string
  sedeId?: string
}): {
  filtro: FinanceiroFiltro
  values: Pick<FinanceiroFiltroValues, 'dataDe' | 'dataAte' | 'sedeId'>
} {
  const { filtro, values } = parseFiltroFinanceiro({
    dataDe: sp.dataDe,
    dataAte: sp.dataAte,
    page: sp.page,
  })

  const sedeParsed = z.string().uuid().safeParse(sp.sedeId)
  const sedeId = sedeParsed.success ? sedeParsed.data : undefined

  return {
    filtro: {
      dataDe: filtro.dataDe,
      dataAte: filtro.dataAte,
      page: filtro.page,
      sedeId,
    },
    values: { dataDe: values.dataDe, dataAte: values.dataAte, sedeId },
  }
}

export type BalancoPeriodoChipId = 'hoje' | '7d' | 'mes' | 'mes_anterior' | 'tudo'

export function resolverPeriodoChip(
  chip: BalancoPeriodoChipId,
  agora = new Date(),
): { dataDe?: string; dataAte?: string } {
  const ate = formatDataCompetenciaInput(agora)
  if (chip === 'tudo') return {}
  if (chip === 'hoje') return { dataDe: ate, dataAte: ate }
  if (chip === '7d') {
    const de = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - 6, 12)
    return { dataDe: formatDataCompetenciaInput(de), dataAte: ate }
  }
  if (chip === 'mes') {
    const de = new Date(agora.getFullYear(), agora.getMonth(), 1, 12)
    return { dataDe: formatDataCompetenciaInput(de), dataAte: ate }
  }
  const primeiroMesAtual = new Date(agora.getFullYear(), agora.getMonth(), 1, 12)
  const de = new Date(agora.getFullYear(), agora.getMonth() - 1, 1, 12)
  const ultimoAnterior = new Date(primeiroMesAtual.getTime() - 24 * 60 * 60 * 1000)
  ultimoAnterior.setHours(12, 0, 0, 0)
  return {
    dataDe: formatDataCompetenciaInput(de),
    dataAte: formatDataCompetenciaInput(ultimoAnterior),
  }
}

export function detectarPeriodoChip(
  dataDe?: string,
  dataAte?: string,
  agora = new Date(),
): BalancoPeriodoChipId | null {
  if (!dataDe && !dataAte) return 'tudo'
  const chips: BalancoPeriodoChipId[] = ['hoje', '7d', 'mes', 'mes_anterior']
  for (const id of chips) {
    const p = resolverPeriodoChip(id, agora)
    if ((p.dataDe ?? '') === (dataDe ?? '') && (p.dataAte ?? '') === (dataAte ?? '')) {
      return id
    }
  }
  return null
}

export function hrefBalanco(query: {
  dataDe?: string
  dataAte?: string
  sedeId?: string
  page?: number
}): string {
  const params = new URLSearchParams()
  if (query.dataDe) params.set('dataDe', query.dataDe)
  if (query.dataAte) params.set('dataAte', query.dataAte)
  if (query.sedeId) params.set('sedeId', query.sedeId)
  if (query.page && query.page > 1) params.set('page', String(query.page))
  const qs = params.toString()
  return qs ? `/portal/balanco?${qs}` : '/portal/balanco'
}
