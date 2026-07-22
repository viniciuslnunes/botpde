import 'server-only'

import { cache } from 'react'
import { db } from '@torcida/db'
import {
  bucketPorMes,
  resolverIntervaloPeriodo,
  type Periodo,
  type SerieTemporal,
} from '@/lib/admin-insights'

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
  periodo: Periodo,
): Promise<FunilMembrosResumo> {
  const { inicio, fim, inicioAnterior, fimAnterior } = resolverIntervaloPeriodo(periodo)

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
  meses: number,
): Promise<FunilMensalPonto[]> {
  const inicio = new Date()
  inicio.setMonth(inicio.getMonth() - meses)

  const [criados, desligados]: [Array<{ criadoEm: Date }>, Array<{ desligadoEm: Date | null }>] =
    await Promise.all([
      db.saasMembro.findMany({
        where: { tenantId, criadoEm: { gte: inicio } },
        select: { criadoEm: true },
      }),
      db.saasMembro.findMany({
        where: { tenantId, desligadoEm: { gte: inicio } },
        select: { desligadoEm: true },
      }),
    ])

  const serieNovos: SerieTemporal = bucketPorMes(
    criados.map((m) => ({ data: m.criadoEm, valor: 1 })),
    meses,
  )
  const serieDesligados: SerieTemporal = bucketPorMes(
    desligados.flatMap((m) => (m.desligadoEm ? [{ data: m.desligadoEm, valor: 1 }] : [])),
    meses,
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

/** Distribuição dos membros APROVADOS por tipo, unidade e cidade (top 6). */
export const distribuirMembros = cache(async function distribuirMembros(
  tenantId: string,
): Promise<DistribuicaoMembros> {
  const whereAprovado = { tenantId, status: 'APROVADO' as const }

  const [porTipo, porSede, porCidade]: [
    Array<{ tipo: 'SOCIO' | 'TORCEDOR'; _count: { _all: number } }>,
    Array<{ sedeId: string | null; _count: { _all: number } }>,
    Array<{ cidade: string | null; _count: { _all: number } }>,
  ] = await Promise.all([
    db.saasMembro.groupBy({ by: ['tipo'], where: whereAprovado, _count: { _all: true } }),
    db.saasMembro.groupBy({ by: ['sedeId'], where: whereAprovado, _count: { _all: true } }),
    db.saasMembro.groupBy({ by: ['cidade'], where: whereAprovado, _count: { _all: true } }),
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
