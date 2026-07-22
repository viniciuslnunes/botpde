import 'server-only'
import { unstable_cache } from 'next/cache'
import { cache } from 'react'
import { db, calcularMenorValorEstimadosConhecido } from '@torcida/db'
import { JANELA_ONLINE_MS } from '@/lib/presenca'

export type StatsClubeOnboarding = {
  sociosTotal: number
  sociosOnline: number
  torcedoresTotal: number
  torcedoresOnline: number
}

type GrupoClube = {
  canonicalId: string
  afiliacaoIds: string[]
}

type Bucket = {
  socios: Set<string>
  torcedores: Set<string>
  sociosOnline: Set<string>
  torcedoresOnline: Set<string>
}

function criarBucket(): Bucket {
  return {
    socios: new Set(),
    torcedores: new Set(),
    sociosOnline: new Set(),
    torcedoresOnline: new Set(),
  }
}

/**
 * Agrega sócios/torcedores da plataforma por clube canônico (mesmo grupo saoMesmoClube).
 * Torcedores = união de PerfilTorcedor + SaasMembro TORCEDOR aprovado nas torcidas do clube.
 */
export async function calcularStatsClubesOnboarding(
  grupos: GrupoClube[],
): Promise<Map<string, StatsClubeOnboarding>> {
  if (grupos.length === 0) return new Map()

  const allIds = [...new Set(grupos.flatMap((g) => g.afiliacaoIds))]
  const idToCanonical = new Map<string, string>()
  for (const g of grupos) {
    for (const id of g.afiliacaoIds) idToCanonical.set(id, g.canonicalId)
  }

  const limiteOnline = new Date(Date.now() - JANELA_ONLINE_MS)

  type SocioRow = {
    userId: string
    user: { ultimoAcessoEm: Date | null }
    tenant: { afiliacaoId: string | null }
  }
  type PerfilRow = {
    userId: string
    afiliacaoId: string | null
    user: { ultimoAcessoEm: Date | null }
  }

  const [sociosMembros, torcedoresMembros, perfisTorcedor]: [
    SocioRow[],
    SocioRow[],
    PerfilRow[],
  ] = await Promise.all([
    db.saasMembro.findMany({
      where: {
        status: 'APROVADO',
        tipo: 'SOCIO',
        tenant: { afiliacaoId: { in: allIds } },
      },
      select: {
        userId: true,
        user: { select: { ultimoAcessoEm: true } },
        tenant: { select: { afiliacaoId: true } },
      },
    }),
    db.saasMembro.findMany({
      where: {
        status: 'APROVADO',
        tipo: 'TORCEDOR',
        tenant: { afiliacaoId: { in: allIds } },
      },
      select: {
        userId: true,
        user: { select: { ultimoAcessoEm: true } },
        tenant: { select: { afiliacaoId: true } },
      },
    }),
    db.perfilTorcedor.findMany({
      where: { afiliacaoId: { in: allIds } },
      select: {
        userId: true,
        afiliacaoId: true,
        user: { select: { ultimoAcessoEm: true } },
      },
    }),
  ])

  const buckets = new Map<string, Bucket>()
  for (const g of grupos) buckets.set(g.canonicalId, criarBucket())

  function canonical(afiliacaoId: string | null | undefined): string | undefined {
    if (!afiliacaoId) return undefined
    return idToCanonical.get(afiliacaoId)
  }

  function online(d: Date | null): boolean {
    return Boolean(d && d >= limiteOnline)
  }

  for (const m of sociosMembros) {
    const cid = canonical(m.tenant.afiliacaoId)
    if (!cid) continue
    const b = buckets.get(cid)!
    b.socios.add(m.userId)
    if (online(m.user.ultimoAcessoEm)) b.sociosOnline.add(m.userId)
  }

  for (const m of torcedoresMembros) {
    const cid = canonical(m.tenant.afiliacaoId)
    if (!cid) continue
    const b = buckets.get(cid)!
    b.torcedores.add(m.userId)
    if (online(m.user.ultimoAcessoEm)) b.torcedoresOnline.add(m.userId)
  }

  for (const p of perfisTorcedor) {
    const cid = canonical(p.afiliacaoId)
    if (!cid) continue
    const b = buckets.get(cid)!
    b.torcedores.add(p.userId)
    if (online(p.user.ultimoAcessoEm)) b.torcedoresOnline.add(p.userId)
  }

  const result = new Map<string, StatsClubeOnboarding>()
  for (const [cid, b] of buckets) {
    result.set(cid, {
      sociosTotal: b.socios.size,
      sociosOnline: b.sociosOnline.size,
      torcedoresTotal: b.torcedores.size,
      torcedoresOnline: b.torcedoresOnline.size,
    })
  }
  return result
}

/** Menor contagem > 0 entre stats já agregadas (evita re-scan de membros). */
export function menorContagemDeStats(
  stats: Iterable<StatsClubeOnboarding>,
): number | null {
  let min: number | null = null
  for (const s of stats) {
    const n =
      s.torcedoresTotal > 0
        ? s.torcedoresTotal
        : s.sociosTotal > 0
          ? s.sociosTotal
          : 0
    if (n > 0 && (min == null || n < min)) min = n
  }
  return min
}

/**
 * Teto LIMITE_ATE a partir de um Map de stats já calculado (mesmo request do catálogo).
 * Evita a 2ª passagem completa em SaasMembro/PerfilTorcedor.
 */
export function tetoLimiteDeStatsMap(
  statsMap: Map<string, StatsClubeOnboarding>,
): number {
  const menorIbope = calcularMenorValorEstimadosConhecido()
  const menorPlataforma = menorContagemDeStats(statsMap.values())
  if (menorPlataforma != null && menorPlataforma > 0) {
    return Math.min(menorIbope, menorPlataforma)
  }
  return menorIbope
}

/**
 * Menor contagem de torcedores/sócios por clube na plataforma (global, cacheada).
 * Usa a mesma agregação do card de onboarding para consistência.
 */
export const getMenorContagemPlataformaGlobal = cache(async (): Promise<number | null> => {
  return unstable_cache(
    async (): Promise<number | null> => {
      const afiliacoes: { id: string }[] = await db.afiliacao.findMany({
        select: { id: true },
      })
      if (afiliacoes.length === 0) return null

      const stats = await calcularStatsClubesOnboarding(
        afiliacoes.map((a) => ({ canonicalId: a.id, afiliacaoIds: [a.id] })),
      )
      return menorContagemDeStats(stats.values())
    },
    ['onboarding-menor-contagem-plataforma'],
    { revalidate: 300, tags: ['onboarding-afiliacoes'] },
  )()
})

/** Teto conservador para LIMITE_ATE: menor valor IBOPE curado × menor clube na plataforma. */
export async function getTetoLimiteTorcedoresGlobal(): Promise<number> {
  const [menorIbope, menorPlataforma] = await Promise.all([
    Promise.resolve(calcularMenorValorEstimadosConhecido()),
    getMenorContagemPlataformaGlobal(),
  ])
  if (menorPlataforma != null && menorPlataforma > 0) {
    return Math.min(menorIbope, menorPlataforma)
  }
  return menorIbope
}
