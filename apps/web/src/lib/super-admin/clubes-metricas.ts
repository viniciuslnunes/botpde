import 'server-only'

import { cache } from 'react'
import { revalidateTag, unstable_cache } from 'next/cache'
import { db } from '@torcida/db'
import { rotuloSerieClube } from '@torcida/types'
import { bucketPorMes, ultimosMesesSP, type SerieTemporal } from '@/lib/admin-insights'
import {
  carregarMapaPortalMae,
  filtrarTenantsRaiz,
} from '@/lib/tenant-hierarquia-plataforma'
import { labelTipoUnidade } from '@/lib/torcida-labels'

/**
 * Métricas do catálogo de clubes (`/super-admin/clubes/metricas`).
 *
 * Regra da casa aqui: tudo sai de `count`/`groupBy` — nenhum bloco carrega
 * linhas para contar em memória. São ~9 agregações em `Promise.all`, atrás de
 * `unstable_cache` de 5 min: o catálogo muda por edição manual, não por
 * tráfego, então cache curto vale mais que qualquer índice novo. Escrita no
 * catálogo chama `invalidarMetricasClubes` e o painel já reflete.
 */

const CLUBES_METRICAS_TAG = 'super-admin-clubes-metricas'
const TTL_SEGUNDOS = 300
const DIA_MS = 24 * 60 * 60 * 1000

export function invalidarMetricasClubes(): void {
  revalidateTag(CLUBES_METRICAS_TAG, 'max')
}

export type KpisClubes = {
  total: number
  ativos: number
  arquivados: number
  /** Clubes com pelo menos uma torcida real (não sintética) na plataforma. */
  comTorcida: number
  comEscudo: number
  comSerie: number
  comEstimativa: number
  novos30d: number
}

async function fetchKpisClubes(): Promise<KpisClubes> {
  const ha30dias = new Date(Date.now() - 30 * DIA_MS)

  const [total, ativos, tenantsComClube, comEscudo, comSerie, comEstimativa, novos30d]: [
    number,
    number,
    { id: string; afiliacaoId: string | null }[],
    number,
    number,
    number,
    number,
  ] = await Promise.all([
    db.afiliacao.count(),
    db.afiliacao.count({ where: { ativo: true } }),
    db.tenant.findMany({
      where: { sintetico: false, ativo: true, afiliacaoId: { not: null } },
      select: { id: true, afiliacaoId: true },
    }),
    db.afiliacao.count({
      where: { AND: [{ escudoUrl: { not: null } }, { escudoUrl: { not: '' } }] },
    }),
    db.afiliacao.count({ where: { serie: { not: null } } }),
    db.afiliacao.count({ where: { torcedoresEstimados: { gt: 0 } } }),
    db.afiliacao.count({ where: { criadoEm: { gte: ha30dias } } }),
  ])

  const maePorFilho = await carregarMapaPortalMae()
  const raizes = filtrarTenantsRaiz(
    tenantsComClube.map((t) => t.id),
    maePorFilho,
  )
  const raizesSet = new Set(raizes)
  const afiliacoesComTorcida = new Set<string>()
  for (const t of tenantsComClube) {
    if (t.afiliacaoId && raizesSet.has(t.id)) afiliacoesComTorcida.add(t.afiliacaoId)
  }

  return {
    total,
    ativos,
    arquivados: total - ativos,
    comTorcida: afiliacoesComTorcida.size,
    comEscudo,
    comSerie,
    comEstimativa,
    novos30d,
  }
}

export const carregarKpisClubes = cache(async function carregarKpisClubes(): Promise<KpisClubes> {
  return unstable_cache(fetchKpisClubes, ['super-admin-clubes-kpis'], {
    revalidate: TTL_SEGUNDOS,
    tags: [CLUBES_METRICAS_TAG],
  })()
})

export type FatiaClubes = { chave: string; rotulo: string; total: number }

type SerieGroup = { serie: string | null; _count: { _all: number } }
type EstadoGroup = { estado: string | null; _count: { _all: number } }

async function fetchDistribuicoes(): Promise<{
  porSerie: FatiaClubes[]
  porEstado: FatiaClubes[]
}> {
  const [series, estados]: [SerieGroup[], EstadoGroup[]] = await Promise.all([
    db.afiliacao.groupBy({ by: ['serie'], _count: { _all: true } }),
    db.afiliacao.groupBy({ by: ['estado'], _count: { _all: true } }),
  ])

  const porSerie: FatiaClubes[] = series
    .map((linha: SerieGroup) => ({
      chave: linha.serie ?? 'sem',
      rotulo: rotuloSerieClube(linha.serie),
      total: linha._count._all,
    }))
    .sort((a: FatiaClubes, b: FatiaClubes) => b.total - a.total)

  const porEstado: FatiaClubes[] = estados
    .map((linha: EstadoGroup) => ({
      chave: linha.estado ?? 'sem',
      rotulo: linha.estado || 'Sem UF',
      total: linha._count._all,
    }))
    .sort((a: FatiaClubes, b: FatiaClubes) => b.total - a.total)
    .slice(0, 10)

  return { porSerie, porEstado }
}

export const carregarDistribuicoesClubes = cache(async function carregarDistribuicoesClubes() {
  return unstable_cache(fetchDistribuicoes, ['super-admin-clubes-distribuicoes'], {
    revalidate: TTL_SEGUNDOS,
    tags: [CLUBES_METRICAS_TAG],
  })()
})

export type TopClube = {
  id: string
  nome: string
  escudoUrl: string | null
  total: number
}

/** Resolve nome/escudo de um punhado de ids — nunca lista o catálogo inteiro. */
async function hidratarClubes(ids: string[]): Promise<Map<string, { nome: string; escudoUrl: string | null }>> {
  if (ids.length === 0) return new Map()
  const linhas: { id: string; nome: string; escudoUrl: string | null }[] = await db.afiliacao.findMany({
    where: { id: { in: ids } },
    select: { id: true, nome: true, escudoUrl: true },
  })
  return new Map(linhas.map((l) => [l.id, { nome: l.nome, escudoUrl: l.escudoUrl }]))
}

async function fetchRankings(): Promise<{
  porTorcidas: TopClube[]
  porTorcedores: TopClube[]
}> {
  const [tenantsComClube, torcedores, maePorFilho]: [
    { id: string; afiliacaoId: string | null }[],
    { afiliacaoId: string | null; _count: { afiliacaoId: number } }[],
    Map<string, string>,
  ] = await Promise.all([
    db.tenant.findMany({
      where: { ativo: true, sintetico: false, afiliacaoId: { not: null } },
      select: { id: true, afiliacaoId: true },
    }),
    db.perfilTorcedor.groupBy({
      by: ['afiliacaoId'],
      where: { afiliacaoId: { not: null } },
      _count: { afiliacaoId: true },
      orderBy: { _count: { afiliacaoId: 'desc' } },
      take: 10,
    }),
    carregarMapaPortalMae(),
  ])

  const raizesSet = new Set(
    filtrarTenantsRaiz(
      tenantsComClube.map((t) => t.id),
      maePorFilho,
    ),
  )
  const contagemPorClube = new Map<string, number>()
  for (const t of tenantsComClube) {
    if (!t.afiliacaoId || !raizesSet.has(t.id)) continue
    contagemPorClube.set(t.afiliacaoId, (contagemPorClube.get(t.afiliacaoId) ?? 0) + 1)
  }
  const torcidas: { afiliacaoId: string; _count: { afiliacaoId: number } }[] = [
    ...contagemPorClube.entries(),
  ]
    .map(([afiliacaoId, total]) => ({
      afiliacaoId,
      _count: { afiliacaoId: total },
    }))
    .sort((a, b) => b._count.afiliacaoId - a._count.afiliacaoId)
    .slice(0, 10)

  const ids = [
    ...new Set(
      [...torcidas, ...torcedores]
        .map((l) => l.afiliacaoId)
        .filter((id): id is string => typeof id === 'string'),
    ),
  ]
  const mapa = await hidratarClubes(ids)

  type LinhaAgrupada = { afiliacaoId: string | null; _count: { afiliacaoId: number } }
  const montar = (linhas: LinhaAgrupada[]): TopClube[] =>
    linhas
      .filter((l): l is LinhaAgrupada & { afiliacaoId: string } => l.afiliacaoId !== null)
      .map((l) => ({
        id: l.afiliacaoId,
        nome: mapa.get(l.afiliacaoId)?.nome ?? 'Clube removido',
        escudoUrl: mapa.get(l.afiliacaoId)?.escudoUrl ?? null,
        total: l._count.afiliacaoId,
      }))

  return { porTorcidas: montar(torcidas), porTorcedores: montar(torcedores) }
}

export const carregarRankingsClubes = cache(async function carregarRankingsClubes() {
  return unstable_cache(fetchRankings, ['super-admin-clubes-rankings'], {
    revalidate: TTL_SEGUNDOS,
    tags: [CLUBES_METRICAS_TAG],
  })()
})

/**
 * Adesão por mês (fuso SP): quantos torcedores globais escolheram um clube.
 * É o sinal de que o catálogo está sendo usado de verdade, não só povoado.
 */
async function fetchAdesaoPorMes(meses: number): Promise<SerieTemporal> {
  const inicio = ultimosMesesSP(meses)[0]?.inicio ?? new Date(0)
  const perfis: { criadoEm: Date }[] = await db.perfilTorcedor.findMany({
    where: { NOT: { afiliacaoId: null }, criadoEm: { gte: inicio } },
    select: { criadoEm: true },
  })
  return bucketPorMes(
    perfis.map((p) => ({ data: p.criadoEm, valor: 1 })),
    meses,
  )
}

export const carregarAdesaoClubesPorMes = cache(async function carregarAdesaoClubesPorMes(
  meses = 12,
): Promise<SerieTemporal> {
  return unstable_cache(
    () => fetchAdesaoPorMes(meses),
    ['super-admin-clubes-adesao', String(meses)],
    { revalidate: TTL_SEGUNDOS, tags: [CLUBES_METRICAS_TAG] },
  )()
})

export type MetricasClube = {
  id: string
  nome: string
  apelido: string | null
  /** Torcidas-raiz reais (não sintéticas, não portais Caso B). */
  torcidas: number
  /** Sócios APROVADO nas torcidas do clube. */
  socios: number
  /**
   * Torcedores na plataforma: PerfilTorcedor deste clube + membros tipo
   * TORCEDOR aprovados nas torcidas (contagens separadas — não deduplica user).
   */
  torcedoresPerfil: number
  torcedoresMembro: number
  /** Posts em tenants do clube (inclui CN sintético, se houver). */
  publicacoes: number
  partidas: number
  noticias: number
  rivalidades: number
  torcidasConhecidas: number
  estimativa: {
    total: number
    fonte: string | null
    tipo: string | null
  } | null
  torcidasLista: {
    id: string
    nome: string
    slug: string
    ativo: boolean
    membros: number
    posts: number
    /** Unidades (Caso A no worktree + portais Caso B filhos) — para o chevron. */
    unidadesCount: number
  }[]
}

export type UnidadeDaTorcida = {
  id: string
  nome: string
  slug: string | null
  tipoLabel: string
  caso: 'A' | 'B'
  ativo: boolean
  membros: number
  /** Posts do portal (Caso B). Caso A não tem portal — 0. */
  posts: number
}

type TenantClubeRow = {
  id: string
  nome: string
  slug: string
  ativo: boolean
  _count: { membros: number; posts: number }
}

/** Conta unidades leves por torcida-raiz (filhos Caso B + sedes SUBSEDE/PDE no tenant). */
async function contarUnidadesPorRaiz(
  raizIds: string[],
  maePorFilho: Map<string, string>,
): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  for (const id of raizIds) out.set(id, 0)
  if (raizIds.length === 0) return out

  for (const [, mae] of maePorFilho) {
    if (out.has(mae)) {
      out.set(mae, (out.get(mae) ?? 0) + 1)
    }
  }

  const sedesCasoA: { tenantId: string | null }[] = await db.sede.findMany({
    where: {
      tenantId: { in: raizIds },
      tipo: { in: ['SUBSEDE', 'PONTO_ENCONTRO'] },
    },
    select: { tenantId: true },
  })
  for (const s of sedesCasoA) {
    if (!s.tenantId || !out.has(s.tenantId)) continue
    out.set(s.tenantId, (out.get(s.tenantId) ?? 0) + 1)
  }

  return out
}

/** Uso na plataforma de um único clube — tab Métricas do detalhe. */
export const carregarMetricasClube = cache(async function carregarMetricasClube(
  clubeId: string,
): Promise<MetricasClube | null> {
  const tenantDoClube = { afiliacaoId: clubeId } as const
  const torcidaReal = { afiliacaoId: clubeId, sintetico: false } as const

  const [clube, tenantsDoClube, socios, torcedoresMembro, torcedoresPerfil, publicacoes, maePorFilho]: [
    {
      id: string
      nome: string
      apelido: string | null
      torcedoresEstimados: number | null
      torcedoresEstimadosFonte: string | null
      torcedoresEstimadosTipo: string | null
      _count: {
        partidas: number
        noticias: number
        rivalClubeA: number
        rivalClubeB: number
        torcidasConhecidas: number
      }
    } | null,
    TenantClubeRow[],
    number,
    number,
    number,
    number,
    Map<string, string>,
  ] = await Promise.all([
    db.afiliacao.findUnique({
      where: { id: clubeId },
      select: {
        id: true,
        nome: true,
        apelido: true,
        torcedoresEstimados: true,
        torcedoresEstimadosFonte: true,
        torcedoresEstimadosTipo: true,
        _count: {
          select: {
            partidas: true,
            noticias: true,
            rivalClubeA: true,
            rivalClubeB: true,
            torcidasConhecidas: true,
          },
        },
      },
    }),
    db.tenant.findMany({
      where: torcidaReal,
      select: {
        id: true,
        nome: true,
        slug: true,
        ativo: true,
        _count: { select: { membros: true, posts: true } },
      },
      orderBy: { nome: 'asc' },
      take: 80,
    }),
    db.saasMembro.count({
      where: { status: 'APROVADO', tipo: 'SOCIO', tenant: torcidaReal },
    }),
    db.saasMembro.count({
      where: { status: 'APROVADO', tipo: 'TORCEDOR', tenant: torcidaReal },
    }),
    db.perfilTorcedor.count({ where: { afiliacaoId: clubeId } }),
    db.post.count({ where: { tenant: tenantDoClube } }),
    carregarMapaPortalMae(),
  ])

  if (!clube) return null

  const raizIds = filtrarTenantsRaiz(
    tenantsDoClube.map((t) => t.id),
    maePorFilho,
  )
  const raizSet = new Set(raizIds)
  const raizesTodas = tenantsDoClube.filter((t) => raizSet.has(t.id))
  // KPI "torcidas" conta só raiz ativa: suspensa segue na lista, com o selo.
  const raizesAtivas = raizesTodas.filter((t) => t.ativo)
  const raizes = raizesTodas.slice(0, 40)
  const unidadesPorRaiz = await contarUnidadesPorRaiz(
    raizes.map((t) => t.id),
    maePorFilho,
  )

  const torcidasLista: MetricasClube['torcidasLista'] = raizes.map((t) => ({
    id: t.id,
    nome: t.nome,
    slug: t.slug,
    ativo: t.ativo,
    membros: t._count.membros,
    posts: t._count.posts,
    unidadesCount: unidadesPorRaiz.get(t.id) ?? 0,
  }))

  const estimativa =
    typeof clube.torcedoresEstimados === 'number' && clube.torcedoresEstimados > 0
      ? {
          total: clube.torcedoresEstimados,
          fonte: clube.torcedoresEstimadosFonte,
          tipo: clube.torcedoresEstimadosTipo,
        }
      : null

  return {
    id: clube.id,
    nome: clube.nome,
    apelido: clube.apelido,
    // Contagem real de raízes ativas (não o preview limitado a 40 na lista).
    torcidas: raizesAtivas.length,
    socios,
    torcedoresPerfil,
    torcedoresMembro,
    publicacoes,
    partidas: clube._count.partidas,
    noticias: clube._count.noticias,
    rivalidades: clube._count.rivalClubeA + clube._count.rivalClubeB,
    torcidasConhecidas: clube._count.torcidasConhecidas,
    estimativa,
    torcidasLista,
  }
})

/**
 * Unidades de uma torcida-raiz: portais Caso B (filhos) + sedes Caso A
 * (SUBSEDE/PDE ainda no mesmo tenant). Sob demanda — gate super-admin na action.
 */
export async function carregarUnidadesDaTorcida(
  torcidaId: string,
): Promise<UnidadeDaTorcida[]> {
  const torcida: { id: string } | null = await db.tenant.findFirst({
    where: { id: torcidaId, sintetico: false },
    select: { id: true },
  })
  if (!torcida) return []

  const maePorFilho = await carregarMapaPortalMae()
  if (maePorFilho.has(torcidaId)) {
    // Portal Caso B não é torcida — sem unidades próprias neste contrato.
    return []
  }

  const filhosIds = [...maePorFilho.entries()]
    .filter(([, mae]) => mae === torcidaId)
    .map(([filho]) => filho)

  type PortalRow = {
    id: string
    nome: string
    slug: string
    ativo: boolean
    _count: { membros: number; posts: number }
    sedes: { tipo: string }[]
  }
  type SedeCasoARow = {
    id: string
    nome: string
    tipo: string
    ativa: boolean
    _count: { membros: number }
  }

  const [portais, sedesCasoA]: [PortalRow[], SedeCasoARow[]] = await Promise.all([
    filhosIds.length === 0
      ? Promise.resolve([] as PortalRow[])
      : db.tenant.findMany({
          where: { id: { in: filhosIds }, sintetico: false },
          select: {
            id: true,
            nome: true,
            slug: true,
            ativo: true,
            _count: { select: { membros: true, posts: true } },
            sedes: {
              where: { sedeId: { not: null } },
              select: { tipo: true },
              take: 1,
            },
          },
          orderBy: { nome: 'asc' },
        }),
    db.sede.findMany({
      where: {
        tenantId: torcidaId,
        tipo: { in: ['SUBSEDE', 'PONTO_ENCONTRO'] },
      },
      select: {
        id: true,
        nome: true,
        tipo: true,
        ativa: true,
        _count: { select: { membros: true } },
      },
      orderBy: { nome: 'asc' },
    }),
  ])

  const casoB: UnidadeDaTorcida[] = portais.map((p) => ({
    id: p.id,
    nome: p.nome,
    slug: p.slug,
    tipoLabel: labelTipoUnidade(p.sedes[0]?.tipo ?? 'SUBSEDE'),
    caso: 'B' as const,
    ativo: p.ativo,
    membros: p._count.membros,
    posts: p._count.posts,
  }))

  const casoA: UnidadeDaTorcida[] = sedesCasoA.map((s) => ({
    id: s.id,
    nome: s.nome,
    slug: null,
    tipoLabel: labelTipoUnidade(s.tipo),
    caso: 'A' as const,
    ativo: s.ativa,
    membros: s._count.membros,
    posts: 0,
  }))

  const peso = (u: UnidadeDaTorcida) =>
    u.tipoLabel === 'Sede' ? 0 : u.tipoLabel === 'Subsede' ? 1 : 2

  return [...casoB, ...casoA].sort((a, b) => {
    const d = peso(a) - peso(b)
    if (d !== 0) return d
    return a.nome.localeCompare(b.nome, 'pt-BR')
  })
}
