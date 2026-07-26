import 'server-only'

import { cache } from 'react'
import { db } from '@torcida/db'
import { bucketPorMes, ultimosMesesSP, type SerieTemporal } from '@/lib/admin-insights'

const DIA_MS = 24 * 60 * 60 * 1000

export type KpisPlataforma = {
  torcidasAtivas: number
  torcidasInativas: number
  novasTorcidas30d: number
  membrosAprovados: number
  novosMembros30d: number
  afiliacoesPendentes: number
}

/** KPIs agregados de toda a plataforma — visão cross-tenant do operador (sem `tenantId`, como Afiliacao/Partida). */
export const carregarKpisPlataforma = cache(async function carregarKpisPlataforma(): Promise<KpisPlataforma> {
  const ha30dias = new Date(Date.now() - 30 * DIA_MS)

  const [
    torcidasAtivas,
    torcidasInativas,
    novasTorcidas30d,
    membrosAprovados,
    novosMembros30d,
    afiliacoesPendentes,
  ]: [number, number, number, number, number, number] = await Promise.all([
    db.tenant.count({ where: { ativo: true, sintetico: false } }),
    db.tenant.count({ where: { ativo: false, sintetico: false } }),
    db.tenant.count({ where: { ativo: true, sintetico: false, criadoEm: { gte: ha30dias } } }),
    db.saasMembro.count({ where: { status: 'APROVADO' } }),
    db.saasMembro.count({ where: { status: 'APROVADO', aprovadoEm: { gte: ha30dias } } }),
    db.solicitacaoUnidade.count({ where: { status: 'PENDENTE', tipo: { not: 'SEDE' } } }),
  ])

  return {
    torcidasAtivas,
    torcidasInativas,
    novasTorcidas30d,
    membrosAprovados,
    novosMembros30d,
    afiliacoesPendentes,
  }
})

/** Novas torcidas por mês (fuso SP) — últimos `meses` meses. */
export const serieNovasTorcidasPorMes = cache(async function serieNovasTorcidasPorMes(
  meses: number,
): Promise<SerieTemporal> {
  const inicio = ultimosMesesSP(meses)[0]?.inicio ?? new Date(0)

  const tenants: { criadoEm: Date }[] = await db.tenant.findMany({
    where: { ativo: true, sintetico: false, criadoEm: { gte: inicio } },
    select: { criadoEm: true },
  })

  return bucketPorMes(
    tenants.map((t) => ({ data: t.criadoEm, valor: 1 })),
    meses,
  )
})

export type TopTorcidaMembros = {
  tenantId: string
  nome: string
  slug: string
  totalMembros: number
}

/** Ranking das torcidas com mais torcedores aprovados. */
export const listarTopTorcidasPorMembros = cache(async function listarTopTorcidasPorMembros(
  limite: number,
): Promise<TopTorcidaMembros[]> {
  const grupos: Array<{ tenantId: string; _count: { _all: number } }> = await db.saasMembro.groupBy({
    by: ['tenantId'],
    where: { status: 'APROVADO' },
    _count: { _all: true },
    orderBy: { _count: { tenantId: 'desc' } },
    take: limite,
  })

  if (grupos.length === 0) return []

  const tenants: { id: string; nome: string; slug: string }[] = await db.tenant.findMany({
    where: { id: { in: grupos.map((g) => g.tenantId) } },
    select: { id: true, nome: true, slug: true },
  })
  const porId = new Map(tenants.map((t) => [t.id, t]))

  return grupos
    .map((g) => {
      const tenant = porId.get(g.tenantId)
      if (!tenant) return null
      return {
        tenantId: tenant.id,
        nome: tenant.nome,
        slug: tenant.slug,
        totalMembros: g._count._all,
      }
    })
    .filter((t): t is TopTorcidaMembros => t !== null)
})
