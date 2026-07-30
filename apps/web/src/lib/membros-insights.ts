import 'server-only'

import { cache } from 'react'
import { db } from '@torcida/db'
import {
  bucketPorIntervaloMes,
  resolverIntervaloPeriodo,
  type IntervaloAnalise,
  type Periodo,
  type SerieTemporal,
} from '@/lib/admin-insights'

function resolverIntervalo(intervalo: Periodo | IntervaloAnalise): IntervaloAnalise {
  return typeof intervalo === 'string' ? resolverIntervaloPeriodo(intervalo) : intervalo
}

export type FunilMembrosPeriodo = {
  novos: number
  aprovados: number
  desligados: number
}

export type FunilMembrosResumo = {
  atual: FunilMembrosPeriodo
  anterior: FunilMembrosPeriodo
}

/** Funil do período vs anterior: novos cadastros × aprovações × desligamentos. */
export const resumirFunilMembros = cache(async function resumirFunilMembros(
  tenantId: string,
  periodo: Periodo | IntervaloAnalise,
): Promise<FunilMembrosResumo> {
  const { inicio, fim, inicioAnterior, fimAnterior } = resolverIntervalo(periodo)

  const contar = (campo: 'criadoEm' | 'aprovadoEm' | 'desligadoEm', de: Date, ate: Date) =>
    db.saasMembro.count({ where: { tenantId, [campo]: { gte: de, lte: ate } } })

  const [novos, aprovados, desligados, novosAnt, aprovadosAnt, desligadosAnt]: number[] =
    await Promise.all([
      contar('criadoEm', inicio, fim),
      contar('aprovadoEm', inicio, fim),
      contar('desligadoEm', inicio, fim),
      contar('criadoEm', inicioAnterior, fimAnterior),
      contar('aprovadoEm', inicioAnterior, fimAnterior),
      contar('desligadoEm', inicioAnterior, fimAnterior),
    ])

  return {
    atual: { novos, aprovados, desligados },
    anterior: { novos: novosAnt, aprovados: aprovadosAnt, desligados: desligadosAnt },
  }
})

export type FunilMensalPonto = {
  mes: string
  novos: number
  desligados: number
}

/** Novos × desligados por mês (fuso SP) — crescimento líquido da base. */
export const serieFunilMensal = cache(async function serieFunilMensal(
  tenantId: string,
  intervalo: IntervaloAnalise,
): Promise<FunilMensalPonto[]> {
  const { inicio, fim } = intervalo

  const [criados, desligados]: [Array<{ criadoEm: Date }>, Array<{ desligadoEm: Date | null }>] =
    await Promise.all([
      db.saasMembro.findMany({
        where: { tenantId, criadoEm: { gte: inicio, lte: fim } },
        select: { criadoEm: true },
      }),
      db.saasMembro.findMany({
        where: { tenantId, desligadoEm: { gte: inicio, lte: fim } },
        select: { desligadoEm: true },
      }),
    ])

  const serieNovos: SerieTemporal = bucketPorIntervaloMes(
    criados.map((m) => ({ data: m.criadoEm, valor: 1 })),
    inicio,
    fim,
  )
  const serieDesligados: SerieTemporal = bucketPorIntervaloMes(
    desligados.flatMap((m) => (m.desligadoEm ? [{ data: m.desligadoEm, valor: 1 }] : [])),
    inicio,
    fim,
  )

  return serieNovos.map((ponto, i) => ({
    mes: ponto.rotulo,
    novos: ponto.valor,
    desligados: serieDesligados[i]?.valor ?? 0,
  }))
})

export type DistribuicaoMembros = {
  socios: number
  torcedores: number
  porSede: { nome: string; quantidade: number }[]
  porCidade: { cidade: string; quantidade: number }[]
}

export type StatusMembrosInsight = 'TODOS' | 'PENDENTE' | 'APROVADO' | 'REPROVADO'

/** Distribuição por tipo (e, quando APROVADO, unidade/cidade top 6). */
export const distribuirMembros = cache(async function distribuirMembros(
  tenantId: string,
  status: 'PENDENTE' | 'APROVADO' | 'REPROVADO' = 'APROVADO',
): Promise<DistribuicaoMembros> {
  const whereStatus = { tenantId, status }

  const [porTipo, porSede, porCidade]: [
    Array<{ tipo: 'SOCIO' | 'TORCEDOR'; _count: { _all: number } }>,
    Array<{ sedeId: string | null; _count: { _all: number } }>,
    Array<{ cidade: string | null; _count: { _all: number } }>,
  ] = await Promise.all([
    db.saasMembro.groupBy({ by: ['tipo'], where: whereStatus, _count: { _all: true } }),
    status === 'APROVADO'
      ? db.saasMembro.groupBy({ by: ['sedeId'], where: whereStatus, _count: { _all: true } })
      : Promise.resolve([]),
    status === 'APROVADO'
      ? db.saasMembro.groupBy({ by: ['cidade'], where: whereStatus, _count: { _all: true } })
      : Promise.resolve([]),
  ])

  const sedeIds = porSede.flatMap((s) => (s.sedeId ? [s.sedeId] : []))
  const sedes: Array<{ id: string; nome: string }> =
    sedeIds.length === 0
      ? []
      : await db.sede.findMany({
          where: { tenantId, id: { in: sedeIds } },
          select: { id: true, nome: true },
        })
  const nomeSede = new Map<string, string>(sedes.map((s) => [s.id, s.nome]))

  let socios = 0
  let torcedores = 0
  for (const t of porTipo) {
    if (t.tipo === 'SOCIO') socios = t._count._all
    else torcedores = t._count._all
  }

  return {
    socios,
    torcedores,
    porSede: porSede
      .map((s) => ({
        nome: s.sedeId ? (nomeSede.get(s.sedeId) ?? 'Unidade') : 'Sem unidade',
        quantidade: s._count._all,
      }))
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 6),
    porCidade: porCidade
      .flatMap((c) => (c.cidade ? [{ cidade: c.cidade, quantidade: c._count._all }] : []))
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 6),
  }
})

export type CarteirinhasResumo = {
  /** Válidas com mais de 30 dias pela frente. */
  emDia: number
  /** Válidas, mas vencem nos próximos 30 dias. */
  vencendo30d: number
  vencidas: number
}

/** Situação das carteirinhas em faixas não sobrepostas (para donut). */
export const resumirCarteirinhas = cache(async function resumirCarteirinhas(
  tenantId: string,
): Promise<CarteirinhasResumo> {
  const agora = new Date()
  const em30dias = new Date(agora.getTime() + 30 * 24 * 60 * 60 * 1000)

  const [emDia, vencendo30d, vencidas]: number[] = await Promise.all([
    db.saasSocio.count({ where: { tenantId, validade: { gte: em30dias } } }),
    db.saasSocio.count({ where: { tenantId, validade: { gte: agora, lt: em30dias } } }),
    db.saasSocio.count({ where: { tenantId, validade: { lt: agora } } }),
  ])

  return { emDia, vencendo30d, vencidas }
})

export type AgingFilaBucket = {
  faixa: string
  quantidade: number
}

export type FilaPendentesResumo = {
  estoque: number
  novos: { atual: number; anterior: number }
  aging: AgingFilaBucket[]
  porTipo: { socios: number; torcedores: number }
}

const FAIXAS_FILA: Array<{ faixa: string; deDias: number; ateDias: number | null }> = [
  { faixa: '0–3 dias', deDias: 0, ateDias: 3 },
  { faixa: '4–7 dias', deDias: 4, ateDias: 7 },
  { faixa: '8–14 dias', deDias: 8, ateDias: 14 },
  { faixa: '15+ dias', deDias: 15, ateDias: null },
]

function faixaAging(dias: number): number {
  for (let i = 0; i < FAIXAS_FILA.length; i++) {
    const f = FAIXAS_FILA[i]!
    if (f.ateDias == null) return i
    if (dias >= f.deDias && dias <= f.ateDias) return i
  }
  return FAIXAS_FILA.length - 1
}

/** Fila PENDENTE: estoque, entradas 30d, aging e mix por tipo. */
export const resumirFilaPendentes = cache(async function resumirFilaPendentes(
  tenantId: string,
  periodo: Periodo | IntervaloAnalise,
): Promise<FilaPendentesResumo> {
  const { inicio, fim, inicioAnterior, fimAnterior } = resolverIntervalo(periodo)
  const agora = new Date()

  const [estoque, novosAtual, novosAnterior, pendentes, porTipo]: [
    number,
    number,
    number,
    Array<{ criadoEm: Date }>,
    Array<{ tipo: 'SOCIO' | 'TORCEDOR'; _count: { _all: number } }>,
  ] = await Promise.all([
    db.saasMembro.count({ where: { tenantId, status: 'PENDENTE' } }),
    db.saasMembro.count({
      where: { tenantId, criadoEm: { gte: inicio, lte: fim } },
    }),
    db.saasMembro.count({
      where: {
        tenantId,
        criadoEm: { gte: inicioAnterior, lte: fimAnterior },
      },
    }),
    db.saasMembro.findMany({
      where: { tenantId, status: 'PENDENTE' },
      select: { criadoEm: true },
    }),
    db.saasMembro.groupBy({
      by: ['tipo'],
      where: { tenantId, status: 'PENDENTE' },
      _count: { _all: true },
    }),
  ])

  const aging: AgingFilaBucket[] = FAIXAS_FILA.map((f) => ({
    faixa: f.faixa,
    quantidade: 0,
  }))
  const msDia = 24 * 60 * 60 * 1000
  for (const p of pendentes) {
    const dias = Math.max(0, Math.floor((agora.getTime() - p.criadoEm.getTime()) / msDia))
    aging[faixaAging(dias)]!.quantidade += 1
  }

  let socios = 0
  let torcedores = 0
  for (const t of porTipo) {
    if (t.tipo === 'SOCIO') socios = t._count._all
    else torcedores = t._count._all
  }

  return {
    estoque,
    novos: { atual: novosAtual, anterior: novosAnterior },
    aging,
    porTipo: { socios, torcedores },
  }
})

export type SerieAprovadosPonto = {
  mes: string
  aprovados: number
  desligados: number
}

/** Aprovações × desligamentos por mês (fuso SP). */
export const serieAprovadosMensal = cache(async function serieAprovadosMensal(
  tenantId: string,
  intervalo: IntervaloAnalise,
): Promise<SerieAprovadosPonto[]> {
  const { inicio, fim } = intervalo

  const [aprovados, desligados]: [
    Array<{ aprovadoEm: Date | null }>,
    Array<{ desligadoEm: Date | null }>,
  ] = await Promise.all([
    db.saasMembro.findMany({
      where: { tenantId, aprovadoEm: { gte: inicio, lte: fim } },
      select: { aprovadoEm: true },
    }),
    db.saasMembro.findMany({
      where: { tenantId, desligadoEm: { gte: inicio, lte: fim } },
      select: { desligadoEm: true },
    }),
  ])

  const serieAprov: SerieTemporal = bucketPorIntervaloMes(
    aprovados.flatMap((m) => (m.aprovadoEm ? [{ data: m.aprovadoEm, valor: 1 }] : [])),
    inicio,
    fim,
  )
  const serieDesl: SerieTemporal = bucketPorIntervaloMes(
    desligados.flatMap((m) => (m.desligadoEm ? [{ data: m.desligadoEm, valor: 1 }] : [])),
    inicio,
    fim,
  )

  return serieAprov.map((ponto, i) => ({
    mes: ponto.rotulo,
    aprovados: ponto.valor,
    desligados: serieDesl[i]?.valor ?? 0,
  }))
})

export type ReprovacoesResumo = {
  estoque: number
  reprovados: { atual: number; anterior: number }
  permiteReenvio: number
  definitivos: number
  porCategoria: { id: string; quantidade: number }[]
}

export type SerieReprovadosPonto = {
  mes: string
  reprovados: number
}

/** Reprovados: estoque, volume 30d, reenvio vs definitivo e mix por categoria. */
export const resumirReprovacoes = cache(async function resumirReprovacoes(
  tenantId: string,
  periodo: Periodo | IntervaloAnalise,
): Promise<ReprovacoesResumo> {
  const { inicio, fim, inicioAnterior, fimAnterior } = resolverIntervalo(periodo)

  const [estoque, atual, anterior, permiteReenvio, definitivos, porCategoria]: [
    number,
    number,
    number,
    number,
    number,
    Array<{ reprovadoCategoria: string | null; _count: { _all: number } }>,
  ] = await Promise.all([
    db.saasMembro.count({ where: { tenantId, status: 'REPROVADO' } }),
    db.saasMembro.count({
      where: { tenantId, reprovadoEm: { gte: inicio, lte: fim } },
    }),
    db.saasMembro.count({
      where: { tenantId, reprovadoEm: { gte: inicioAnterior, lte: fimAnterior } },
    }),
    db.saasMembro.count({
      where: { tenantId, status: 'REPROVADO', reprovadoPermiteReenvio: true },
    }),
    db.saasMembro.count({
      where: { tenantId, status: 'REPROVADO', reprovadoPermiteReenvio: false },
    }),
    db.saasMembro.groupBy({
      by: ['reprovadoCategoria'],
      where: { tenantId, status: 'REPROVADO' },
      _count: { _all: true },
    }),
  ])

  return {
    estoque,
    reprovados: { atual, anterior },
    permiteReenvio,
    definitivos,
    porCategoria: porCategoria
      .map((c) => ({
        id: c.reprovadoCategoria ?? 'OUTRO',
        quantidade: c._count._all,
      }))
      .sort((a, b) => b.quantidade - a.quantidade),
  }
})

/** Reprovações por mês (fuso SP). */
export const serieReprovadosMensal = cache(async function serieReprovadosMensal(
  tenantId: string,
  intervalo: IntervaloAnalise,
): Promise<SerieReprovadosPonto[]> {
  const { inicio, fim } = intervalo

  const reprovados: Array<{ reprovadoEm: Date | null }> = await db.saasMembro.findMany({
    where: { tenantId, reprovadoEm: { gte: inicio, lte: fim } },
    select: { reprovadoEm: true },
  })

  const serie: SerieTemporal = bucketPorIntervaloMes(
    reprovados.flatMap((m) => (m.reprovadoEm ? [{ data: m.reprovadoEm, valor: 1 }] : [])),
    inicio,
    fim,
  )

  return serie.map((ponto) => ({
    mes: ponto.rotulo,
    reprovados: ponto.valor,
  }))
})

/** Entradas na fila (criadoEm) por mês — útil na tab Pendentes. */
export const serieEntradasFilaMensal = cache(async function serieEntradasFilaMensal(
  tenantId: string,
  intervalo: IntervaloAnalise,
): Promise<FunilMensalPonto[]> {
  const { inicio, fim } = intervalo

  const criados: Array<{ criadoEm: Date }> = await db.saasMembro.findMany({
    where: { tenantId, criadoEm: { gte: inicio, lte: fim } },
    select: { criadoEm: true },
  })

  const serie: SerieTemporal = bucketPorIntervaloMes(
    criados.map((m) => ({ data: m.criadoEm, valor: 1 })),
    inicio,
    fim,
  )

  return serie.map((ponto) => ({
    mes: ponto.rotulo,
    novos: ponto.valor,
    desligados: 0,
  }))
})
