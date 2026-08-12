import 'server-only'

import { cache } from 'react'
import { db } from '@torcida/db'
import { bucketPorMes, ultimosMesesSP, type SerieTemporal } from '@/lib/admin-insights'
import {
  carregarMapaPortalMae,
  filtrarTenantsRaiz,
} from '@/lib/tenant-hierarquia-plataforma'

const DIA_MS = 24 * 60 * 60 * 1000

export type KpisPlataforma = {
  torcidasAtivas: number
  torcidasInativas: number
  novasTorcidas30d: number
  membrosAprovados: number
  novosMembros30d: number
  afiliacoesPendentes: number
}

type TenantSituacao = {
  id: string
  ativo: boolean
  criadoEm: Date
}

/** KPIs agregados de toda a plataforma — visão cross-tenant do operador (sem `tenantId`, como Afiliacao/Partida). */
export const carregarKpisPlataforma = cache(async function carregarKpisPlataforma(): Promise<KpisPlataforma> {
  const ha30dias = new Date(Date.now() - 30 * DIA_MS)

  const [tenants, membrosAprovados, novosMembros30d, afiliacoesPendentes, maePorFilho]: [
    TenantSituacao[],
    number,
    number,
    number,
    Map<string, string>,
  ] = await Promise.all([
    db.tenant.findMany({
      where: { sintetico: false },
      select: { id: true, ativo: true, criadoEm: true },
    }),
    db.saasMembro.count({ where: { status: 'APROVADO' } }),
    db.saasMembro.count({ where: { status: 'APROVADO', aprovadoEm: { gte: ha30dias } } }),
    db.solicitacaoUnidade.count({ where: { status: 'PENDENTE', tipo: { not: 'SEDE' } } }),
    carregarMapaPortalMae(),
  ])

  const raizSet = new Set(filtrarTenantsRaiz(tenants.map((t) => t.id), maePorFilho))
  let torcidasAtivas = 0
  let torcidasInativas = 0
  let novasTorcidas30d = 0
  for (const t of tenants) {
    if (!raizSet.has(t.id)) continue
    if (t.ativo) {
      torcidasAtivas += 1
      if (t.criadoEm >= ha30dias) novasTorcidas30d += 1
    } else {
      torcidasInativas += 1
    }
  }

  return {
    torcidasAtivas,
    torcidasInativas,
    novasTorcidas30d,
    membrosAprovados,
    novosMembros30d,
    afiliacoesPendentes,
  }
})

/** Novas torcidas-raiz por mês (fuso SP) — últimos `meses` meses. */
export const serieNovasTorcidasPorMes = cache(async function serieNovasTorcidasPorMes(
  meses: number,
): Promise<SerieTemporal> {
  const inicio = ultimosMesesSP(meses)[0]?.inicio ?? new Date(0)

  const [tenants, maePorFilho]: [{ id: string; criadoEm: Date }[], Map<string, string>] =
    await Promise.all([
      db.tenant.findMany({
        where: { ativo: true, sintetico: false, criadoEm: { gte: inicio } },
        select: { id: true, criadoEm: true },
      }),
      carregarMapaPortalMae(),
    ])

  const raizSet = new Set(filtrarTenantsRaiz(tenants.map((t) => t.id), maePorFilho))

  return bucketPorMes(
    tenants.filter((t) => raizSet.has(t.id)).map((t) => ({ data: t.criadoEm, valor: 1 })),
    meses,
  )
})

export type TopTorcidaMembros = {
  tenantId: string
  nome: string
  slug: string
  totalMembros: number
}

/** Ranking das torcidas-raiz com mais torcedores aprovados. */
export const listarTopTorcidasPorMembros = cache(async function listarTopTorcidasPorMembros(
  limite: number,
): Promise<TopTorcidaMembros[]> {
  const [grupos, maePorFilho]: [
    Array<{ tenantId: string; _count: { _all: number } }>,
    Map<string, string>,
  ] = await Promise.all([
    db.saasMembro.groupBy({
      by: ['tenantId'],
      where: { status: 'APROVADO' },
      _count: { _all: true },
      orderBy: { _count: { tenantId: 'desc' } },
      // Pega folga: portais Caso B podem ocupar o topo e ser filtrados.
      take: Math.max(limite * 4, 20),
    }),
    carregarMapaPortalMae(),
  ])

  if (grupos.length === 0) return []

  const raizSet = new Set(
    filtrarTenantsRaiz(
      grupos.map((g) => g.tenantId),
      maePorFilho,
    ),
  )
  const gruposRaiz = grupos.filter((g) => raizSet.has(g.tenantId)).slice(0, limite)
  if (gruposRaiz.length === 0) return []

  const tenants: { id: string; nome: string; slug: string }[] = await db.tenant.findMany({
    where: { id: { in: gruposRaiz.map((g) => g.tenantId) } },
    select: { id: true, nome: true, slug: true },
  })
  const porId = new Map(tenants.map((t) => [t.id, t]))

  return gruposRaiz
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
    .filter((x): x is TopTorcidaMembros => x !== null)
})
