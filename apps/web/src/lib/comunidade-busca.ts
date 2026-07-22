import { cache } from 'react'
import { db, Prisma } from '@torcida/db'
import { getVisibleTenantIds } from './hierarquia'
import { canFollowUsers } from './social'
import { getAutoresSemAcesso, resolverAvatarSocial, resolverPerfilPrivadoEfetivo } from './perfil-social'
import { normalizarHashtag } from './comunidade-social'
import {
  postIncludeBusca,
  projetarPostBusca,
  type PostSocialItem,
} from './feed'
import { enriquecerPostsComBadges } from './autor-badges'
import { buscarCanaisEUnidades, type CanalItem, type UnidadeBuscaItem } from './canais'
import { formatNomeTorcida } from '@torcida/types'

export type BuscaComunidadeModo = 'rapida' | 'completa'

export interface MembroBuscaItem {
  id: string
  nome: string | null
  avatarUrl: string | null
  tenantNome: string
  perfilPrivado: boolean
  statusSeguimento: 'PENDENTE' | 'APROVADO' | 'REJEITADO' | 'BLOQUEADO' | null
  seguidores: number
  podeSeguir: boolean
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
  user: { id: string; nome: string | null; avatarUrl: string | null }
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
  const termoLike = `%${q}%`

  try {
    // GROUP BY (não DISTINCT): Postgres exige que expressões do ORDER BY
    // apareçam no SELECT quando há DISTINCT — similarity quebrava a busca inteira.
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
          u.nome ILIKE ${termoLike}
          OR COALESCE(pm.bio, '') ILIKE ${termoLike}
        )
      GROUP BY m.user_id, u.nome
      ORDER BY GREATEST(
        similarity(lower(COALESCE(u.nome, '')), lower(${q})),
        MAX(similarity(lower(COALESCE(pm.bio, '')), lower(${q})))
      ) DESC,
      u.nome ASC NULLS LAST
      LIMIT ${limit}
    `
    return rows.map((row: { userId: string }) => row.userId)
  } catch (error) {
    if (isPgTrgmUnavailableError(error)) return null
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

export async function buscarMembrosComunidade(
  tenantId: string,
  userId: string,
  q: string,
  opts: { visibleTenantIds?: string[]; modo?: BuscaComunidadeModo } = {},
): Promise<MembroBuscaItem[]> {
  if (q.length < 2) return []

  const modo = opts.modo ?? 'completa'
  const limites = LIMITES_POR_MODO[modo]
  const visibleIds = opts.visibleTenantIds ?? (await getVisibleTenantIds(tenantId, 'comunidade'))
  const bloqueadosIds = await getBloqueadosDoUsuario(userId)

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
                {
                  perfisMembro: {
                    some: { bio: { contains: q, mode: 'insensitive' }, tenantId },
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
      user: { select: { id: true, nome: true, avatarUrl: true } },
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
  if (candidatos.length === 0) return []

  const candidatoIds = candidatos.map((c) => c.userId)

  // Dropdown só mostra avatar/nome/torcida — pula follow + contagens.
  if (modo === 'rapida') {
    const perfis: { userId: string; perfilPrivado: boolean }[] =
      await db.perfilMembro.findMany({
        where: { tenantId, userId: { in: candidatoIds } },
        select: { userId: true, perfilPrivado: true },
      })
    const perfilPorId = new Map(perfis.map((p) => [p.userId, p]))

    return candidatos.map((r) => {
      const perfil = perfilPorId.get(r.userId)
      return {
        id: r.user.id,
        nome: r.user.nome,
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
      where: { tenantId, userId: { in: candidatoIds } },
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
    canFollowUsers(userId, candidatoIds, tenantId),
  ])

  const perfilPorId = new Map(perfis.map((p) => [p.userId, p]))
  const statusPorId = new Map(seguimentos.map((s) => [s.seguidoId, s.status]))
  const seguidoresPorId = new Map(contagensRows.map((c) => [c.seguidoId, c._count._all]))

  return candidatos.map((r) => {
    const perfil = perfilPorId.get(r.userId)
    return {
      id: r.user.id,
      nome: r.user.nome,
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
  const visibleTenantIds = await getVisibleTenantIds(tenantId, 'comunidade')
  const normalizedTag = normalizarHashtag(termo.replace(/^#/, ''))

  const [membros, hashtagRowsTrgm, postIdsTrgm, canaisUnidades]: [
    MembroBuscaItem[],
    Array<{ tag: string; total: number }> | null,
    string[] | null,
    { canais: CanalItem[]; unidades: UnidadeBuscaItem[] },
  ] = await Promise.all([
    buscarMembrosComunidade(tenantId, userId, termo, { visibleTenantIds, modo }),
    buscarHashtagsPorTrgm(visibleTenantIds, normalizedTag, limites.hashtags),
    buscarPostIdsPorTrgm(visibleTenantIds, termo, limites.postsCand),
    modo === 'rapida'
      ? Promise.resolve({ canais: [] as CanalItem[], unidades: [] as UnidadeBuscaItem[] })
      : buscarCanaisEUnidades(tenantId, userId, termo, { visibleTenantIds }),
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
