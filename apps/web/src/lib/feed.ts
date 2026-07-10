import { cache } from 'react'
import { db } from '@torcida/db'
import { getFeedComunidade, type ComunicadoFeedItem } from './comunidade'
import { getVisibleTenantIds } from './hierarquia'

import { getNoticiasAprovadas, type NoticiaAprovadaItem } from './noticias'

interface FeedOpts {
  cursor?: string
  take?: number
  afiliacaoId?: string | null
}

type SeguimentoLite = { seguidoId: string }

export interface PostSocialItem {
  id: string
  tenantId: string
  titulo: string | null
  conteudo: string
  imagemUrl: string | null
  midiaUrls: string[]
  tipo: 'INSTITUCIONAL' | 'MEMBRO'
  visibilidade: 'PUBLICO' | 'TENANT' | 'PRIVADO'
  criadoEm: Date
  autorId: string
  tenant: { nome: string }
  autor: { id: string; nome: string | null; avatarUrl: string | null }
  totalReacoes: number
  totalComentarios: number
  minhaReacao: 'CURTIR' | 'FORCA' | null
}

/** Shape cru do Prisma antes de projetar em PostSocialItem. */
export type PostRaw = Omit<PostSocialItem, 'totalReacoes' | 'totalComentarios' | 'minhaReacao'> & {
  _count: { reacoes: number; comentarios: number }
  reacoes: { tipo: 'CURTIR' | 'FORCA' }[]
}

export function projetarPost(post: PostRaw): PostSocialItem {
  const { _count, reacoes, ...rest } = post
  return {
    ...rest,
    totalReacoes: _count.reacoes,
    totalComentarios: _count.comentarios,
    minhaReacao: reacoes[0]?.tipo ?? null,
  }
}

export function postInclude(userId?: string) {
  return {
    tenant: { select: { nome: true } },
    autor: { select: { id: true, nome: true, avatarUrl: true } },
    _count: { select: { reacoes: true, comentarios: true } },
    reacoes: userId
      ? { where: { userId }, select: { tipo: true }, take: 1 }
      : ({ where: { id: '' }, select: { tipo: true }, take: 1 } as const),
  } as const
}

interface FeedCursor {
  id: string
  criadoEmIso: string
}

export interface FeedPersonalizadoResult {
  announcements: ComunicadoFeedItem[]
  postsSeguindo: PostSocialItem[]
  postsSugeridos: PostSocialItem[]
  noticias: NoticiaAprovadaItem[]
  pageInfo: {
    nextCursor: string | null
    hasMore: boolean
  }
}

function decodeCursor(cursor?: string): FeedCursor | null {
  if (!cursor) return null
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8')
    const parsed = JSON.parse(raw) as FeedCursor
    if (!parsed.id || !parsed.criadoEmIso) return null
    return parsed
  } catch {
    return null
  }
}

function encodeCursor(post: { id: string; criadoEm: Date }): string {
  return Buffer.from(
    JSON.stringify({
      id: post.id,
      criadoEmIso: post.criadoEm.toISOString(),
    }),
    'utf8',
  ).toString('base64url')
}

function buildCursorWhere(cursor: FeedCursor | null) {
  if (!cursor) return undefined
  const data = new Date(cursor.criadoEmIso)
  if (Number.isNaN(data.getTime())) return undefined
  return {
    OR: [{ criadoEm: { lt: data } }, { criadoEm: data, id: { lt: cursor.id } }],
  }
}

function sortPostsDesc(a: { criadoEm: Date }, b: { criadoEm: Date }): number {
  return b.criadoEm.getTime() - a.criadoEm.getTime()
}

export const getPostsParaFeed = cache(async function getPostsParaFeed(
  tenantId: string,
  userId: string | undefined,
  opts: FeedOpts = {},
): Promise<Pick<FeedPersonalizadoResult, 'postsSeguindo' | 'postsSugeridos' | 'pageInfo'>> {
  const take = Math.min(Math.max(opts.take ?? 20, 5), 50)
  const decodedCursor = decodeCursor(opts.cursor)
  const cursorWhere = buildCursorWhere(decodedCursor)

  const [visibleTenantIds, seguindo]: [string[], SeguimentoLite[]] = await Promise.all([
    getVisibleTenantIds(tenantId, 'comunidade'),
    userId
      ? db.seguimento.findMany({
          where: { seguidorId: userId, status: 'APROVADO' },
          select: { seguidoId: true },
        })
      : Promise.resolve([] as SeguimentoLite[]),
  ])

  if (!userId) {
    const sugeridosRaw = (await db.post.findMany({
      where: {
        tenantId: { in: visibleTenantIds },
        tipo: 'MEMBRO',
        visibilidade: 'PUBLICO',
        oculto: false,
        ...cursorWhere,
      },
      orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
      take: take + 1,
      include: postInclude(),
    })) as PostRaw[]
    const sugeridos: PostSocialItem[] = sugeridosRaw.map(projetarPost)
    const slice = sugeridos.slice(0, take)
    const hasMore = sugeridos.length > take
    return {
      postsSeguindo: [],
      postsSugeridos: slice,
      pageInfo: {
        hasMore,
        nextCursor: hasMore && slice.length > 0 ? encodeCursor(slice[slice.length - 1]) : null,
      },
    }
  }

  const redeIds = [userId, ...seguindo.map((s) => s.seguidoId)]
  const redeSet = new Set(redeIds)

  // Uma query em vez de duas (rede + descoberta) — menos round-trips no Postgres remoto.
  const postsRaw = (await db.post.findMany({
    where: {
      tenantId: { in: visibleTenantIds },
      tipo: 'MEMBRO',
      oculto: false,
      ...cursorWhere,
      OR: [
        { autorId: { in: redeIds } },
        { autorId: { notIn: redeIds }, visibilidade: 'PUBLICO' },
      ],
    },
    orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
    take: (take + 1) * 2,
    include: postInclude(userId),
  })) as PostRaw[]

  const dedup = new Map<string, PostSocialItem>()
  for (const post of postsRaw.map(projetarPost)) {
    if (!dedup.has(post.id)) dedup.set(post.id, post)
  }
  const ordenados = [...dedup.values()].sort(sortPostsDesc)
  const hasMore = ordenados.length > take
  const pagina = ordenados.slice(0, take)
  const nextCursor = hasMore && pagina.length > 0 ? encodeCursor(pagina[pagina.length - 1]) : null

  return {
    postsSeguindo: pagina.filter((post) => redeSet.has(post.autorId)),
    postsSugeridos: pagina.filter((post) => !redeSet.has(post.autorId)),
    pageInfo: { nextCursor, hasMore },
  }
})

export const getComunicadosParaFeed = cache(async function getComunicadosParaFeed(tenantId: string, userId?: string) {
  const visibleTenantIds = await getVisibleTenantIds(tenantId, 'comunidade')
  const { announcements } = await getFeedComunidade(tenantId, {
    userId,
    takePosts: 0,
    visibleTenantIds,
  })
  return announcements
})

/** Query leve para o painel "Para seguir" — não reutiliza o feed completo de posts. */
export const getSugestoesAutoresParaAside = cache(async function getSugestoesAutoresParaAside(
  tenantId: string,
  userId: string,
) {
  const [visibleTenantIds, seguindo]: [string[], SeguimentoLite[]] = await Promise.all([
    getVisibleTenantIds(tenantId, 'comunidade'),
    db.seguimento.findMany({
      where: { seguidorId: userId, status: 'APROVADO' },
      select: { seguidoId: true },
    }),
  ])
  const redeIds = [userId, ...seguindo.map((s) => s.seguidoId)]

  const posts: Array<{ autor: { id: string; nome: string | null; avatarUrl: string | null } }> =
    await db.post.findMany({
      where: {
        tenantId: { in: visibleTenantIds },
        tipo: 'MEMBRO',
        visibilidade: 'PUBLICO',
        oculto: false,
        autorId: { notIn: redeIds },
      },
      orderBy: { criadoEm: 'desc' },
      take: 12,
      distinct: ['autorId'],
      select: {
        autor: { select: { id: true, nome: true, avatarUrl: true } },
      },
    })

  return posts.map((p) => p.autor).slice(0, 4)
})

export async function getFeedPersonalizado(
  tenantId: string,
  userId?: string,
  opts: FeedOpts = {},
): Promise<FeedPersonalizadoResult> {
  const [noticias, announcements, posts] = await Promise.all([
    opts.afiliacaoId != null && opts.afiliacaoId !== ''
      ? getNoticiasAprovadas(opts.afiliacaoId)
      : Promise.resolve([] as NoticiaAprovadaItem[]),
    getComunicadosParaFeed(tenantId, userId),
    getPostsParaFeed(tenantId, userId, opts),
  ])

  return {
    announcements,
    postsSeguindo: posts.postsSeguindo,
    postsSugeridos: posts.postsSugeridos,
    noticias,
    pageInfo: posts.pageInfo,
  }
}
