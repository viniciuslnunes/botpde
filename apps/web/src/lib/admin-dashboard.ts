import { cache } from 'react'
import { db } from '@torcida/db'
import { formatDataCompetenciaInput } from '@torcida/types'
import { resumirFinanceiro, type FinanceiroResumo } from '@/lib/financeiro'
import {
  bucketPorDia,
  bucketPorMes,
  resolverIntervaloPeriodo,
  type Periodo,
  type SerieTemporal,
} from '@/lib/admin-insights'

export type DashboardKpis = {
  totalMembros: number
  pendentes: number
  reprovados: number
  novosUltimos30d: number
  totalSocios: number
  sociosVencendo: number
  sociosVencidos: number
  proxEventosCount: number
  totalSedes: number
  sedesAtivas: number
}

export const carregarKpisDashboard = cache(async function carregarKpisDashboard(
  tenantId: string,
): Promise<DashboardKpis> {
  const agora = new Date()
  const em30dias = new Date(agora.getTime() + 30 * 24 * 60 * 60 * 1000)
  const ha30dias = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000)

  const [
    totalMembros,
    pendentes,
    reprovados,
    novosUltimos30d,
    totalSocios,
    sociosVencendo,
    sociosVencidos,
    proxEventosCount,
    totalSedes,
    sedesAtivas,
  ]: [number, number, number, number, number, number, number, number, number, number] =
    await Promise.all([
      db.saasMembro.count({ where: { tenantId, status: 'APROVADO' } }),
      db.saasMembro.count({ where: { tenantId, status: 'PENDENTE' } }),
      db.saasMembro.count({ where: { tenantId, status: 'REPROVADO' } }),
      db.saasMembro.count({
        where: { tenantId, status: 'APROVADO', aprovadoEm: { gte: ha30dias } },
      }),
      db.saasSocio.count({ where: { tenantId } }),
      db.saasSocio.count({ where: { tenantId, validade: { gte: agora, lte: em30dias } } }),
      db.saasSocio.count({ where: { tenantId, validade: { lt: agora } } }),
      db.evento.count({ where: { tenantId, data: { gte: agora } } }),
      db.sede.count({ where: { tenantId } }),
      db.sede.count({ where: { tenantId, ativa: true } }),
    ])

  return {
    totalMembros,
    pendentes,
    reprovados,
    novosUltimos30d,
    totalSocios,
    sociosVencendo,
    sociosVencidos,
    proxEventosCount,
    totalSedes,
    sedesAtivas,
  }
})

export type DashboardEventoItem = {
  id: string
  titulo: string
  local: string | null
  data: Date
  confirmados: number
}

export type DashboardMembroRecente = {
  nome: string
  tipo: string
  aprovadoEm: Date | null
}

export type DashboardAuditoriaItem = {
  id: string
  acao: string
  entidade: string
  criadoEm: Date
}

type EventoRow = {
  id: string
  titulo: string
  local: string | null
  data: Date
  _count: { rsvps: number }
}

export const carregarListasDashboard = cache(async function carregarListasDashboard(
  tenantId: string,
): Promise<{
  proxEventos: DashboardEventoItem[]
  membrosRecentes: DashboardMembroRecente[]
  auditoria: DashboardAuditoriaItem[]
}> {
  const agora = new Date()

  const [eventos, auditoria, membrosRecentes]: [
    EventoRow[],
    DashboardAuditoriaItem[],
    DashboardMembroRecente[],
  ] = await Promise.all([
    db.evento.findMany({
      where: { tenantId, data: { gte: agora } },
      orderBy: { data: 'asc' },
      take: 3,
      select: {
        id: true,
        titulo: true,
        local: true,
        data: true,
        _count: { select: { rsvps: { where: { status: 'CONFIRMADO' } } } },
      },
    }),
    db.auditLog.findMany({
      where: { tenantId },
      orderBy: { criadoEm: 'desc' },
      take: 8,
      select: { id: true, acao: true, entidade: true, criadoEm: true },
    }),
    db.saasMembro.findMany({
      where: { tenantId, status: 'APROVADO', aprovadoEm: { not: null } },
      orderBy: { aprovadoEm: 'desc' },
      take: 5,
      select: { nome: true, tipo: true, aprovadoEm: true },
    }),
  ])

  return {
    proxEventos: eventos.map((e) => ({
      id: e.id,
      titulo: e.titulo,
      local: e.local,
      data: e.data,
      confirmados: e._count.rsvps,
    })),
    membrosRecentes,
    auditoria,
  }
})

/** Série de novos cadastros (SaasMembro.criadoEm) — por dia (30d/90d) ou por mês (12m). */
export const carregarSerieNovosMembros = cache(async function carregarSerieNovosMembros(
  tenantId: string,
  periodo: Periodo = '30d',
): Promise<SerieTemporal> {
  const { inicio, fim } = resolverIntervaloPeriodo(periodo)

  const rows: Array<{ criadoEm: Date }> = await db.saasMembro.findMany({
    where: { tenantId, criadoEm: { gte: inicio, lte: fim } },
    select: { criadoEm: true },
  })

  if (periodo === '12m') {
    return bucketPorMes(
      rows.map((r) => ({ data: r.criadoEm, valor: 1 })),
      12,
    )
  }
  return bucketPorDia(
    rows.map((r) => r.criadoEm),
    inicio,
    fim,
  )
})

export type ReceitaMesDashboard = {
  receitaMes: number
  receitaMesAnterior: number
}

/** Receita (livro-caixa) do mês corrente vs mês anterior — para `TrendDelta`. */
export const carregarReceitaMesDashboard = cache(async function carregarReceitaMesDashboard(
  tenantId: string,
): Promise<ReceitaMesDashboard> {
  const agora = new Date()
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1)
  const fimMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 0)
  const inicioMesAnterior = new Date(agora.getFullYear(), agora.getMonth() - 1, 1)
  const fimMesAnterior = new Date(agora.getFullYear(), agora.getMonth(), 0)

  const [mes, mesAnterior]: [FinanceiroResumo, FinanceiroResumo] = await Promise.all([
    resumirFinanceiro(tenantId, {
      dataDe: formatDataCompetenciaInput(inicioMes),
      dataAte: formatDataCompetenciaInput(fimMes),
    }),
    resumirFinanceiro(tenantId, {
      dataDe: formatDataCompetenciaInput(inicioMesAnterior),
      dataAte: formatDataCompetenciaInput(fimMesAnterior),
    }),
  ])

  return { receitaMes: mes.totalReceitas, receitaMesAnterior: mesAnterior.totalReceitas }
})
