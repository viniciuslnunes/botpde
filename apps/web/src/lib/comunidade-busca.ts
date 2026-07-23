import { cache } from 'react'
import { db, Prisma } from '@torcida/db'
import { canFollowUsers } from './social'
import {
  getAutoresSemAcesso,
  getContagensSeguimentoEmLote,
  resolverAvatarSocial,
  resolverPerfilPrivadoEfetivo,
} from './perfil-social'
import { normalizarHashtag, foldAccents } from './comunidade-social'
import {
  postIncludeBusca,
  projetarPostBusca,
  resolveVisibleTenantIdsForFeed,
  type PostSocialItem,
} from './feed'
import { enriquecerPostsComBadges } from './autor-badges'
import { buscarCanaisEUnidades, type CanalItem, type UnidadeBuscaItem } from './canais'
import { formatNomeTorcida } from '@torcida/types'

/**
 * Expressão SQL que remove acentos comuns pt-BR sem exigir extensão `unaccent`.
 * Deve espelhar `foldAccents` do lado JS (query já vem folded).
 */
const SQL_FOLD_FROM =
  'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ'
const SQL_FOLD_TO = 'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn'

/** Termo de busca: sem @ inicial, sem acentos, lower. */
function termoBuscaMembro(q: string): string {
  return foldAccents(q.replace(/^@+/, '').trim())
}

/**
 * Escopo de tenants da busca — o mesmo do feed. No tenant sintético da CN
 * (`getVisibleTenantIds` só devolveria o container vazio de `SaasMembro`),
 * expande para as TOs do clube + sintético.
 */
async function resolveTenantIdsParaBusca(tenantId: string, userId: string): Promise<string[]> {
  return resolveVisibleTenantIdsForFeed(tenantId, userId)
}

/** Contexto de follow: na CN o viewer não tem vínculo no sintético — `null` usa afiliação/TO reais. */
async function resolveFollowContextoId(tenantId: string): Promise<string | null> {
  const tenant: { sintetico: boolean } | null = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { sintetico: true },
  })
  return tenant?.sintetico ? null : tenantId
}

export type BuscaComunidadeModo = 'rapida' | 'completa'

export interface MembroBuscaItem {
  id: string
  nome: string | null
  nickname: string | null
  avatarUrl: string | null
  tenantNome: string
  perfilPrivado: boolean
  statusSeguimento: 'PENDENTE' | 'APROVADO' | 'REJEITADO' | 'BLOQUEADO' | null
  seguidores: number
  podeSeguir: boolean
}

export interface SugestaoMembroBusca extends MembroBuscaItem {
  bio: string | null
  publicacoes: number
  mesmaUnidade: boolean
  unidadeNome: string | null
  unidadeTipo: string | null
  tipoMembro: 'SOCIO' | 'TORCEDOR'
  cidade: string | null
}

const SUGESTOES_BUSCA_LIMITE = 12
const SUGESTOES_BUSCA_CANDIDATOS = 48

type SugestaoMembroBuscaRaw = {
  userId: string
  tenantId: string
  tipo: 'SOCIO' | 'TORCEDOR'
  cidade: string | null
  sedeId: string | null
  user: { id: string; nome: string | null; avatarUrl: string | null }
  tenant: { nome: string }
  sede: { nome: string; tipo: string } | null
  /** Bio do PerfilTorcedor quando ainda não há PerfilMembro. */
  bioTorcedor?: string | null
  /** Veio do PerfilTorcedor da afiliação (comunidade do clube). */
  viaPerfilTorcedor?: boolean
}

function pontuarSugestaoMembro(input: {
  mesmaUnidade: boolean
  mesmoTenant: boolean
  ultimaAtividade: Date | null
  seguidores: number
  publicacoes: number
  /** Na CN, torcedor do clube (PerfilTorcedor / TORCEDOR) sobe acima de sócio de TO. */
  torcedorDoClube?: boolean
}): number {
  let score = 0
  if (input.torcedorDoClube) score += 2_000
  if (input.mesmaUnidade) score += 1_000
  else if (input.mesmoTenant) score += 500

  if (input.ultimaAtividade) {
    const dias = (Date.now() - input.ultimaAtividade.getTime()) / (1000 * 60 * 60 * 24)
    score += Math.max(0, 200 - dias * 5)
  }

  score += Math.min(input.seguidores, 50) * 2
  score += Math.min(input.publicacoes, 20)
  return score
}

export interface BuscaComunidadeResult {
  membros: MembroBuscaItem[]
  hashtags: Array<{ tag: string; total: number }>
  posts: PostSocialItem[]
  canais: CanalItem[]
  unidades: UnidadeBuscaItem[]
}

type MembroBuscaRaw = {
  userId: string
  tenantId: string
  tipo: 'SOCIO' | 'TORCEDOR'
  user: { id: string; nome: string | null; nickname: string | null; avatarUrl: string | null }
  tenant: { nome: string }
}

type BuscaLimites = {
  membrosCand: number
  membrosOut: number
  hashtags: number
  postsCand: number
  postsOut: number
}

const LIMITES_POR_MODO: Record<BuscaComunidadeModo, BuscaLimites> = {
  rapida: { membrosCand: 16, membrosOut: 6, hashtags: 6, postsCand: 8, postsOut: 4 },
  completa: { membrosCand: 40, membrosOut: 20, hashtags: 10, postsCand: 15, postsOut: 10 },
}

function isPgTrgmUnavailableError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (/pg_trgm/i.test(error.message) ||
      /similarity/i.test(error.message) ||
      /operator does not exist/i.test(error.message) ||
      /function .*similarity/i.test(error.message))
  )
}

async function buscarCandidatosMembrosPorTrgm(
  tenantId: string,
  userId: string,
  visibleIds: string[],
  q: string,
  limit: number,
): Promise<string[] | null> {
  if (visibleIds.length === 0) return []
  const termo = termoBuscaMembro(q)
  if (termo.length < 2) return []
  const termoLike = `%${termo}%`

  try {
    // GROUP BY (não DISTINCT): Postgres exige que expressões do ORDER BY
    // apareçam no SELECT quando há DISTINCT — similarity quebrava a busca inteira.
    // Match sem acento (translate) em nome + nickname + bio.
    const rows = await db.$queryRaw<Array<{ userId: string }>>`
      SELECT m.user_id AS "userId"
      FROM saas_membros m
      INNER JOIN saas_users u ON u.id = m.user_id
      LEFT JOIN saas_perfis_membro pm
        ON pm.user_id = m.user_id
       AND pm.tenant_id = ${tenantId}
      WHERE m.status = 'APROVADO'
        AND m.tenant_id IN (${Prisma.join(visibleIds)})
        AND m.user_id <> ${userId}
        AND (
          translate(lower(COALESCE(u.nome, '')), ${SQL_FOLD_FROM}, ${SQL_FOLD_TO}) LIKE ${termoLike}
          OR translate(lower(COALESCE(u.nickname, '')), ${SQL_FOLD_FROM}, ${SQL_FOLD_TO}) LIKE ${termoLike}
          OR translate(lower(COALESCE(pm.bio, '')), ${SQL_FOLD_FROM}, ${SQL_FOLD_TO}) LIKE ${termoLike}
        )
      GROUP BY m.user_id, u.nome, u.nickname
      ORDER BY GREATEST(
        similarity(
          translate(lower(COALESCE(u.nome, '')), ${SQL_FOLD_FROM}, ${SQL_FOLD_TO}),
          ${termo}
        ),
        similarity(
          translate(lower(COALESCE(u.nickname, '')), ${SQL_FOLD_FROM}, ${SQL_FOLD_TO}),
          ${termo}
        ),
        MAX(similarity(
          translate(lower(COALESCE(pm.bio, '')), ${SQL_FOLD_FROM}, ${SQL_FOLD_TO}),
          ${termo}
        ))
      ) DESC,
      u.nome ASC NULLS LAST
      LIMIT ${limit}
    `
    return rows.map((row: { userId: string }) => row.userId)
  } catch (error) {
    if (isPgTrgmUnavailableError(error)) {
      // Sem pg_trgm: ainda aplica fold + nickname via LIKE.
      try {
        const rows = await db.$queryRaw<Array<{ userId: string }>>`
          SELECT m.user_id AS "userId"
          FROM saas_membros m
          INNER JOIN saas_users u ON u.id = m.user_id
          LEFT JOIN saas_perfis_membro pm
            ON pm.user_id = m.user_id
           AND pm.tenant_id = ${tenantId}
          WHERE m.status = 'APROVADO'
            AND m.tenant_id IN (${Prisma.join(visibleIds)})
            AND m.user_id <> ${userId}
            AND (
              translate(lower(COALESCE(u.nome, '')), ${SQL_FOLD_FROM}, ${SQL_FOLD_TO}) LIKE ${termoLike}
              OR translate(lower(COALESCE(u.nickname, '')), ${SQL_FOLD_FROM}, ${SQL_FOLD_TO}) LIKE ${termoLike}
              OR translate(lower(COALESCE(pm.bio, '')), ${SQL_FOLD_FROM}, ${SQL_FOLD_TO}) LIKE ${termoLike}
            )
          GROUP BY m.user_id, u.nome
          ORDER BY u.nome ASC NULLS LAST
          LIMIT ${limit}
        `
        return rows.map((row: { userId: string }) => row.userId)
      } catch {
        return null
      }
    }
    throw error
  }
}

async function buscarHashtagsPorTrgm(
  visibleTenantIds: string[],
  normalizedTag: string,
  limit: number,
): Promise<Array<{ tag: string; total: number }> | null> {
  if (visibleTenantIds.length === 0 || normalizedTag.length < 2) return []
  const termoLike = `%${normalizedTag}%`

  try {
    const rows = await db.$queryRaw<Array<{ tag: string; total: number }>>`
      SELECT h.tag AS tag, COUNT(ph.id)::int AS total
      FROM saas_hashtags h
      LEFT JOIN saas_post_hashtags ph ON ph.hashtag_id = h.id
      WHERE h.tenant_id IN (${Prisma.join(visibleTenantIds)})
        AND h.tag ILIKE ${termoLike}
      GROUP BY h.id, h.tag
      ORDER BY similarity(lower(h.tag), lower(${normalizedTag})) DESC, total DESC, h.tag ASC
      LIMIT ${limit}
    `
    return rows
  } catch (error) {
    if (isPgTrgmUnavailableError(error)) return null
    throw error
  }
}

async function buscarPostIdsPorTrgm(
  visibleTenantIds: string[],
  termo: string,
  limit: number,
): Promise<string[] | null> {
  if (visibleTenantIds.length === 0) return []
  const termoLike = `%${termo}%`

  try {
    const rows = await db.$queryRaw<Array<{ id: string }>>`
      SELECT p.id AS id
      FROM saas_posts p
      WHERE p.tenant_id IN (${Prisma.join(visibleTenantIds)})
        AND p.tipo = 'MEMBRO'
        AND p.oculto = false
        AND p.visibilidade = 'PUBLICO'
        AND p.conversa_id IS NULL
        AND p.conteudo ILIKE ${termoLike}
      ORDER BY similarity(lower(p.conteudo), lower(${termo})) DESC, p.criado_em DESC, p.id DESC
      LIMIT ${limit}
    `
    return rows.map((row: { id: string }) => row.id)
  } catch (error) {
    if (isPgTrgmUnavailableError(error)) return null
    throw error
  }
}

const getBloqueadosDoUsuario = cache(async (userId: string): Promise<Set<string>> => {
  const bloqueios: { bloqueadorId: string; bloqueadoId: string }[] =
    await db.bloqueioUsuario.findMany({
      where: { OR: [{ bloqueadorId: userId }, { bloqueadoId: userId }] },
      select: { bloqueadorId: true, bloqueadoId: true },
    })

  return new Set(
    bloqueios.map((b) => (b.bloqueadorId === userId ? b.bloqueadoId : b.bloqueadorId)),
  )
})

/** Membros sugeridos na página `/portal/comunidade/busca` (estado inicial, sem termo). */
export async function getSugestoesMembrosParaBusca(
  tenantId: string,
  userId: string,
): Promise<SugestaoMembroBusca[]> {
  const visibleIds = await resolveTenantIdsParaBusca(tenantId, userId)
  if (visibleIds.length === 0) return []

  const [viewerMembro, seguindo, bloqueadosIds, tenantMeta] = await Promise.all([
    db.saasMembro.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { sedeId: true },
    }) as Promise<{ sedeId: string | null } | null>,
    db.seguimento.findMany({
      where: { seguidorId: userId, status: 'APROVADO' },
      select: { seguidoId: true },
    }) as Promise<{ seguidoId: string }[]>,
    getBloqueadosDoUsuario(userId),
    db.tenant.findUnique({
      where: { id: tenantId },
      select: {
        sintetico: true,
        afiliacaoId: true,
        afiliacao: { select: { nome: true, apelido: true } },
      },
    }) as Promise<{
      sintetico: boolean
      afiliacaoId: string | null
      afiliacao: { nome: string; apelido: string | null } | null
    } | null>,
  ])

  const modoNacional = Boolean(tenantMeta?.sintetico)
  const followContextoId = modoNacional ? null : tenantId
  const viewerSedeId = viewerMembro?.sedeId ?? null
  const excluirIds = [...new Set([userId, ...seguindo.map((s) => s.seguidoId), ...bloqueadosIds])]
  const nomeClube =
    tenantMeta?.afiliacao?.apelido || tenantMeta?.afiliacao?.nome || 'Comunidade nacional'

  const [rows, perfisTorcedor]: [
    SugestaoMembroBuscaRaw[],
    Array<{
      userId: string
      bio: string | null
      regiao: string | null
      user: { id: string; nome: string | null; avatarUrl: string | null }
    }>,
  ] = await Promise.all([
    db.saasMembro.findMany({
      where: {
        status: 'APROVADO',
        tenantId: { in: visibleIds },
        userId: { notIn: excluirIds },
      },
      select: {
        userId: true,
        tenantId: true,
        tipo: true,
        cidade: true,
        sedeId: true,
        user: { select: { id: true, nome: true, avatarUrl: true } },
        tenant: { select: { nome: true } },
        sede: { select: { nome: true, tipo: true } },
      },
      take: SUGESTOES_BUSCA_CANDIDATOS,
      orderBy: { criadoEm: 'desc' },
    }) as Promise<SugestaoMembroBuscaRaw[]>,
    modoNacional && tenantMeta?.afiliacaoId
      ? (db.perfilTorcedor.findMany({
          where: {
            afiliacaoId: tenantMeta.afiliacaoId,
            onboardingConcluidoEm: { not: null },
            userId: { notIn: excluirIds },
          },
          orderBy: { atualizadoEm: 'desc' },
          take: SUGESTOES_BUSCA_CANDIDATOS,
          select: {
            userId: true,
            bio: true,
            regiao: true,
            user: { select: { id: true, nome: true, avatarUrl: true } },
          },
        }) as Promise<
          Array<{
            userId: string
            bio: string | null
            regiao: string | null
            user: { id: string; nome: string | null; avatarUrl: string | null }
          }>
        >)
      : Promise.resolve([]),
  ])

  const porUsuario = new Map<string, SugestaoMembroBuscaRaw>()

  function scoreVinculo(r: SugestaoMembroBuscaRaw): number {
    return (
      (r.viaPerfilTorcedor ? 4 : 0) +
      (r.tipo === 'TORCEDOR' ? 2 : 0) +
      (r.sedeId && r.sedeId === viewerSedeId ? 2 : 0) +
      (r.tenantId === tenantId ? 1 : 0)
    )
  }

  for (const r of rows) {
    const existente = porUsuario.get(r.userId)
    if (!existente || scoreVinculo(r) > scoreVinculo(existente)) {
      porUsuario.set(r.userId, r)
    }
  }

  // CN: torcedores do clube (PerfilTorcedor) entram como candidatos principais.
  // Sócio de TO já presente permanece sócio; quem só tem perfil global vira TORCEDOR.
  for (const p of perfisTorcedor) {
    const existente = porUsuario.get(p.userId)
    if (existente?.tipo === 'SOCIO') {
      existente.viaPerfilTorcedor = true
      if (!existente.bioTorcedor) existente.bioTorcedor = p.bio
      continue
    }
    const candidato: SugestaoMembroBuscaRaw = {
      userId: p.userId,
      tenantId,
      tipo: 'TORCEDOR',
      cidade: p.regiao,
      sedeId: null,
      user: p.user,
      tenant: { nome: nomeClube },
      sede: null,
      bioTorcedor: p.bio,
      viaPerfilTorcedor: true,
    }
    if (!existente || scoreVinculo(candidato) >= scoreVinculo(existente)) {
      porUsuario.set(p.userId, candidato)
    }
  }

  const candidatos = [...porUsuario.values()]
  if (candidatos.length === 0) return []

  const candidatoIds = candidatos.map((c) => c.userId)

  // Perfil social: no tenant real usa o contexto; na CN tenta o tenant do vínculo do candidato.
  const perfilTenantIds = followContextoId
    ? [tenantId]
    : [...new Set(candidatos.map((c) => c.tenantId))]

  const [perfis, seguimentos, contagensMap, podeSeguirLista, postsRecentes] = await Promise.all([
    db.perfilMembro.findMany({
      where: { tenantId: { in: perfilTenantIds }, userId: { in: candidatoIds } },
      select: { userId: true, tenantId: true, perfilPrivado: true, bio: true },
    }) as Promise<
      { userId: string; tenantId: string; perfilPrivado: boolean; bio: string | null }[]
    >,
    db.seguimento.findMany({
      where: { seguidorId: userId, seguidoId: { in: candidatoIds } },
      select: { seguidoId: true, status: true },
    }) as Promise<
      { seguidoId: string; status: 'PENDENTE' | 'APROVADO' | 'REJEITADO' | 'BLOQUEADO' }[]
    >,
    getContagensSeguimentoEmLote(candidatoIds, tenantId),
    canFollowUsers(userId, candidatoIds, followContextoId),
    db.post.findMany({
      where: {
        autorId: { in: candidatoIds },
        tenantId: { in: visibleIds },
        tipo: 'MEMBRO',
        oculto: false,
        visibilidade: 'PUBLICO',
        conversaId: null,
      },
      orderBy: { criadoEm: 'desc' },
      distinct: ['autorId'],
      select: { autorId: true, criadoEm: true },
    }) as Promise<{ autorId: string; criadoEm: Date }[]>,
  ])

  const perfilPorUsuario = new Map<string, { perfilPrivado: boolean; bio: string | null }>()
  const candidatoPorUser = new Map(candidatos.map((c) => [c.userId, c]))
  for (const p of perfis) {
    const cand = candidatoPorUser.get(p.userId)
    const atual = perfilPorUsuario.get(p.userId)
    if (!atual) {
      perfilPorUsuario.set(p.userId, p)
      continue
    }
    if (cand && p.tenantId === cand.tenantId) perfilPorUsuario.set(p.userId, p)
  }

  const statusPorId = new Map(seguimentos.map((s) => [s.seguidoId, s.status]))
  const ultimaAtividadePorId = new Map(postsRecentes.map((p) => [p.autorId, p.criadoEm]))

  const enriquecidos: Array<SugestaoMembroBusca & { _score: number }> = []
  for (const r of candidatos) {
    const perfil = perfilPorUsuario.get(r.userId)
    const perfilPrivado = resolverPerfilPrivadoEfetivo(perfil?.perfilPrivado, {
      tipo: r.tipo,
      status: 'APROVADO',
    })
    const podeSeguir = podeSeguirLista.get(r.userId) ?? false
    if (!podeSeguir) continue

    const mesmaUnidade = viewerSedeId != null && r.sedeId === viewerSedeId
    const contagens = contagensMap.get(r.userId) ?? { seguidores: 0, seguindo: 0, publicacoes: 0 }
    const ultimaAtividade = ultimaAtividadePorId.get(r.userId) ?? null
    const torcedorDoClube = r.tipo === 'TORCEDOR' || Boolean(r.viaPerfilTorcedor)

    enriquecidos.push({
      id: r.user.id,
      nome: r.user.nome,
      nickname: null,
      avatarUrl: resolverAvatarSocial(r.user.avatarUrl),
      tenantNome: formatNomeTorcida(r.tenant.nome),
      perfilPrivado,
      statusSeguimento: statusPorId.get(r.userId) ?? null,
      seguidores: contagens.seguidores,
      podeSeguir,
      bio: perfil?.bio ?? r.bioTorcedor ?? null,
      publicacoes: contagens.publicacoes,
      mesmaUnidade,
      unidadeNome: r.sede?.nome ?? null,
      unidadeTipo: r.sede?.tipo ?? null,
      tipoMembro: r.tipo,
      cidade: r.cidade,
      _score: pontuarSugestaoMembro({
        mesmaUnidade,
        mesmoTenant: r.tenantId === tenantId,
        ultimaAtividade,
        seguidores: contagens.seguidores,
        publicacoes: contagens.publicacoes,
        torcedorDoClube: modoNacional && torcedorDoClube,
      }),
    })
  }

  enriquecidos.sort((a, b) => b._score - a._score)

  return enriquecidos.slice(0, SUGESTOES_BUSCA_LIMITE).map(({ _score: _, ...item }) => item)
}

export async function buscarMembrosComunidade(
  tenantId: string,
  userId: string,
  q: string,
  opts: { visibleTenantIds?: string[]; modo?: BuscaComunidadeModo } = {},
): Promise<MembroBuscaItem[]> {
  const termo = termoBuscaMembro(q)
  if (termo.length < 2) return []

  const modo = opts.modo ?? 'completa'
  const limites = LIMITES_POR_MODO[modo]
  const visibleIds =
    opts.visibleTenantIds ?? (await resolveTenantIdsParaBusca(tenantId, userId))
  const [bloqueadosIds, followContextoId] = await Promise.all([
    getBloqueadosDoUsuario(userId),
    resolveFollowContextoId(tenantId),
  ])

  const perfilTenantFilter: string | { in: string[] } = followContextoId ?? { in: visibleIds }

  const trigramCandidateIds = await buscarCandidatosMembrosPorTrgm(
    tenantId,
    userId,
    visibleIds,
    q,
    limites.membrosCand,
  )

  const rows: MembroBuscaRaw[] = await db.saasMembro.findMany({
    where: {
      status: 'APROVADO',
      tenantId: { in: visibleIds },
      userId: {
        ...(trigramCandidateIds !== null
          ? { in: trigramCandidateIds.length > 0 ? trigramCandidateIds : ['__never__'] }
          : { not: userId }),
      },
      ...(trigramCandidateIds === null
        ? {
            user: {
              OR: [
                { nome: { contains: q, mode: 'insensitive' } },
                { nickname: { contains: termo, mode: 'insensitive' } },
                {
                  perfisMembro: {
                    some: {
                      bio: { contains: q, mode: 'insensitive' },
                      tenantId: perfilTenantFilter,
                    },
                  },
                },
              ],
            },
          }
        : {}),
    },
    select: {
      userId: true,
      tenantId: true,
      tipo: true,
      user: { select: { id: true, nome: true, nickname: true, avatarUrl: true } },
      tenant: { select: { nome: true } },
    },
    take: limites.membrosCand,
  })

  const orderedRows =
    trigramCandidateIds !== null
      ? [...rows].sort(
          (a, b) => trigramCandidateIds.indexOf(a.userId) - trigramCandidateIds.indexOf(b.userId),
        )
      : rows

  const vistos = new Set<string>()
  const candidatos: MembroBuscaRaw[] = []
  for (const r of orderedRows) {
    if (vistos.has(r.userId) || bloqueadosIds.has(r.userId)) continue
    vistos.add(r.userId)
    candidatos.push(r)
    if (candidatos.length >= limites.membrosOut) break
  }

  // CN: inclui torcedores globais (PerfilTorcedor) que não têm SaasMembro nas TOs.
  if (followContextoId === null && candidatos.length < limites.membrosOut) {
    const tenantMeta: {
      afiliacaoId: string | null
      afiliacao: { nome: string; apelido: string | null } | null
    } | null = await db.tenant.findUnique({
      where: { id: tenantId },
      select: {
        afiliacaoId: true,
        afiliacao: { select: { nome: true, apelido: true } },
      },
    })
    if (tenantMeta?.afiliacaoId) {
      const nomeClube =
        tenantMeta.afiliacao?.apelido || tenantMeta.afiliacao?.nome || 'Comunidade nacional'
      const restantes = limites.membrosOut - candidatos.length
      const termoLike = `%${termo}%`
      const torcedorIds = await db.$queryRaw<Array<{ userId: string }>>`
        SELECT pt.user_id AS "userId"
        FROM saas_perfis_torcedor pt
        INNER JOIN saas_users u ON u.id = pt.user_id
        WHERE pt.afiliacao_id = ${tenantMeta.afiliacaoId}
          AND pt.onboarding_concluido_em IS NOT NULL
          AND pt.user_id <> ${userId}
          AND (
            translate(lower(COALESCE(u.nome, '')), ${SQL_FOLD_FROM}, ${SQL_FOLD_TO}) LIKE ${termoLike}
            OR translate(lower(COALESCE(u.nickname, '')), ${SQL_FOLD_FROM}, ${SQL_FOLD_TO}) LIKE ${termoLike}
          )
        ORDER BY pt.atualizado_em DESC
        LIMIT ${restantes + bloqueadosIds.size + vistos.size}
      `
      const idsFiltrados = torcedorIds
        .map((r: { userId: string }) => r.userId)
        .filter((id: string) => !vistos.has(id) && !bloqueadosIds.has(id))
        .slice(0, restantes)

      if (idsFiltrados.length > 0) {
        const torcedores: Array<{
          id: string
          nome: string | null
          nickname: string | null
          avatarUrl: string | null
        }> = await db.user.findMany({
          where: { id: { in: idsFiltrados } },
          select: { id: true, nome: true, nickname: true, avatarUrl: true },
        })
        const porId = new Map(torcedores.map((u) => [u.id, u]))
        for (const id of idsFiltrados) {
          const u = porId.get(id)
          if (!u || vistos.has(id)) continue
          vistos.add(id)
          candidatos.push({
            userId: id,
            tenantId,
            tipo: 'TORCEDOR',
            user: u,
            tenant: { nome: nomeClube },
          })
        }
      }
    }
  }

  if (candidatos.length === 0) return []

  const candidatoIds = candidatos.map((c) => c.userId)

  // Dropdown só mostra avatar/nome/torcida — pula follow + contagens.
  if (modo === 'rapida') {
    const perfis: { userId: string; perfilPrivado: boolean }[] =
      await db.perfilMembro.findMany({
        where: { tenantId: perfilTenantFilter, userId: { in: candidatoIds } },
        select: { userId: true, perfilPrivado: true },
      })
    const perfilPorId = new Map(perfis.map((p) => [p.userId, p]))

    return candidatos.map((r) => {
      const perfil = perfilPorId.get(r.userId)
      return {
        id: r.user.id,
        nome: r.user.nome,
        nickname: r.user.nickname,
        avatarUrl: resolverAvatarSocial(r.user.avatarUrl),
        tenantNome: formatNomeTorcida(r.tenant.nome),
        perfilPrivado: resolverPerfilPrivadoEfetivo(perfil?.perfilPrivado, {
          tipo: r.tipo,
          status: 'APROVADO',
        }),
        statusSeguimento: null,
        seguidores: 0,
        podeSeguir: false,
      }
    })
  }

  const [perfis, seguimentos, contagensRows, podeSeguirLista] = await Promise.all([
    db.perfilMembro.findMany({
      where: { tenantId: perfilTenantFilter, userId: { in: candidatoIds } },
      select: { userId: true, perfilPrivado: true },
    }) as Promise<{ userId: string; perfilPrivado: boolean }[]>,
    db.seguimento.findMany({
      where: { seguidorId: userId, seguidoId: { in: candidatoIds } },
      select: { seguidoId: true, status: true },
    }) as Promise<
      { seguidoId: string; status: 'PENDENTE' | 'APROVADO' | 'REJEITADO' | 'BLOQUEADO' }[]
    >,
    db.seguimento.groupBy({
      by: ['seguidoId'],
      where: { seguidoId: { in: candidatoIds }, status: 'APROVADO' },
      _count: { _all: true },
    }) as Promise<{ seguidoId: string; _count: { _all: number } }[]>,
    canFollowUsers(userId, candidatoIds, followContextoId),
  ])

  const perfilPorId = new Map(perfis.map((p) => [p.userId, p]))
  const statusPorId = new Map(seguimentos.map((s) => [s.seguidoId, s.status]))
  const seguidoresPorId = new Map(contagensRows.map((c) => [c.seguidoId, c._count._all]))

  return candidatos.map((r) => {
    const perfil = perfilPorId.get(r.userId)
    return {
      id: r.user.id,
      nome: r.user.nome,
      nickname: r.user.nickname,
      avatarUrl: resolverAvatarSocial(r.user.avatarUrl),
      tenantNome: formatNomeTorcida(r.tenant.nome),
      perfilPrivado: resolverPerfilPrivadoEfetivo(perfil?.perfilPrivado, {
        tipo: r.tipo,
        status: 'APROVADO',
      }),
      statusSeguimento: statusPorId.get(r.userId) ?? null,
      seguidores: seguidoresPorId.get(r.userId) ?? 0,
      podeSeguir: podeSeguirLista.get(r.userId) ?? false,
    }
  })
}

export async function buscarComunidade(
  tenantId: string,
  userId: string,
  q: string,
  opts: { modo?: BuscaComunidadeModo } = {},
): Promise<BuscaComunidadeResult> {
  const termo = q.trim()
  if (termo.length < 2) {
    return { membros: [], hashtags: [], posts: [], canais: [], unidades: [] }
  }

  const modo = opts.modo ?? 'completa'
  const limites = LIMITES_POR_MODO[modo]
  const [visibleTenantIds, followContextoId] = await Promise.all([
    resolveTenantIdsParaBusca(tenantId, userId),
    resolveFollowContextoId(tenantId),
  ])
  const normalizedTag = normalizarHashtag(termo.replace(/^#/, ''))
  const modoNacional = followContextoId === null

  const [membros, hashtagRowsTrgm, postIdsTrgm, canaisUnidades]: [
    MembroBuscaItem[],
    Array<{ tag: string; total: number }> | null,
    string[] | null,
    { canais: CanalItem[]; unidades: UnidadeBuscaItem[] },
  ] = await Promise.all([
    buscarMembrosComunidade(tenantId, userId, termo, { visibleTenantIds, modo }),
    buscarHashtagsPorTrgm(visibleTenantIds, normalizedTag, limites.hashtags),
    buscarPostIdsPorTrgm(visibleTenantIds, termo, limites.postsCand),
    // CN: só canais PUBLICO (mesmo critério da vitrine nacional) — nunca TENANT/HIERARQUIA.
    modo === 'rapida'
      ? Promise.resolve({ canais: [] as CanalItem[], unidades: [] as UnidadeBuscaItem[] })
      : buscarCanaisEUnidades(tenantId, userId, termo, { visibleTenantIds }).then((r) => {
          if (!modoNacional) return r
          return {
            canais: r.canais.filter((c) => c.visibilidadeCanal === 'PUBLICO'),
            unidades: r.unidades.filter((u) => u.tenantId !== tenantId),
          }
        }),
  ])

  let hashtagRows: Array<{ tag: string; total: number }>
  if (hashtagRowsTrgm !== null) {
    hashtagRows = hashtagRowsTrgm
  } else {
    const hashtagFallback: Array<{ tag: string; _count: { posts: number } }> =
      await db.hashtag.findMany({
        where: {
          tenantId: { in: visibleTenantIds },
          tag: { contains: normalizedTag, mode: 'insensitive' },
        },
        select: { tag: true, _count: { select: { posts: true } } },
        take: limites.hashtags,
      })
    hashtagRows = hashtagFallback.map((h) => ({ tag: h.tag, total: h._count.posts }))
  }

  type PostBuscaLoaded = Parameters<typeof projetarPostBusca>[0]
  let postsRaw: PostBuscaLoaded[]
  if (postIdsTrgm !== null) {
    postsRaw =
      postIdsTrgm.length === 0
        ? []
        : ((await db.post.findMany({
            where: { id: { in: postIdsTrgm } },
            include: postIncludeBusca(),
          })) as PostBuscaLoaded[])
  } else {
    postsRaw = (await db.post.findMany({
      where: {
        tenantId: { in: visibleTenantIds },
        tipo: 'MEMBRO',
        oculto: false,
        visibilidade: 'PUBLICO',
        conversaId: null,
        conteudo: { contains: termo, mode: 'insensitive' },
      },
      orderBy: { criadoEm: 'desc' },
      take: limites.postsCand,
      include: postIncludeBusca(),
    })) as PostBuscaLoaded[]
  }

  let posts = postsRaw.map(projetarPostBusca)
  if (postIdsTrgm !== null) {
    posts = posts.sort((a, b) => postIdsTrgm.indexOf(a.id) - postIdsTrgm.indexOf(b.id))
  }
  const autorIds = posts.map((p) => p.autorId)
  const semAcesso = await getAutoresSemAcesso(userId, tenantId, autorIds)
  posts = posts.filter((p) => !semAcesso.has(p.autorId)).slice(0, limites.postsOut)

  const postsFinais =
    modo === 'rapida' ? posts : await enriquecerPostsComBadges(posts)

  return {
    membros,
    // Mantém ordem do ranking (similarity); desempate por volume na query SQL.
    hashtags: hashtagRows.slice(0, limites.hashtags).map((h) => ({ tag: h.tag, total: h.total })),
    posts: postsFinais,
    canais: canaisUnidades.canais,
    unidades: canaisUnidades.unidades,
  }
}
