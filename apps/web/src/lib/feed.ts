import { db } from '@torcida/db'
import { getFeedComunidade, type ComunicadoFeedItem } from './comunidade'
import { getVisibleTenantIds } from './hierarquia'

import { getNoticiasAprovadas, type NoticiaAprovadaItem } from './noticias'

interface FeedOpts {
  cursor?: string
  take?: number
  afiliacaoId?: string | null
}

export interface PostSocialItem {
  id: string
  tenantId: string
  titulo: string | null
  conteudo: string
  imagemUrl: string | null
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

export async function getFeedPersonalizado(
  tenantId: string,
  userId?: string,
  opts: FeedOpts = {},
): Promise<FeedPersonalizadoResult> {
  const take = Math.min(Math.max(opts.take ?? 20, 5), 50)
  const decodedCursor = decodeCursor(opts.cursor)
  const cursorWhere = buildCursorWhere(decodedCursor)
  const visibleTenantIds = await getVisibleTenantIds(tenantId, 'comunidade')

  const noticias =
    opts.afiliacaoId != null && opts.afiliacaoId !== ''
      ? await getNoticiasAprovadas(opts.afiliacaoId)
      : []

  const { announcements } = await getFeedComunidade(tenantId, { userId, takePosts: 0 })

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
      announcements,
      postsSeguindo: [],
      postsSugeridos: slice,
      noticias,
      pageInfo: {
        hasMore,
        nextCursor: hasMore && slice.length > 0 ? encodeCursor(slice[slice.length - 1]) : null,
      },
    }
  }

  const seguindo: { seguidoId: string }[] = await db.seguimento.findMany({
    where: { seguidorId: userId, status: 'APROVADO' },
    select: { seguidoId: true },
  })
  const seguindoIds = seguindo.map((s) => s.seguidoId)
  const seguindoSet = new Set(seguindoIds)

  const suggestedShare = seguindoIds.length > 0 ? Math.max(1, Math.floor(take * 0.2)) : take
  const takeSeguindo = Math.max(0, take - suggestedShare)
  const takeSugeridos = suggestedShare

  const [postsSeguindoRaw, postsSugeridosRaw] = await Promise.all([
    takeSeguindo > 0
      ? (db.post.findMany({
          where: {
            tenantId: { in: visibleTenantIds },
            tipo: 'MEMBRO',
            oculto: false,
            autorId: { in: seguindoIds.length > 0 ? seguindoIds : [''] },
            ...cursorWhere,
          },
          orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
          take: takeSeguindo + 1,
          include: postInclude(userId),
        }) as Promise<PostRaw[]>)
      : Promise.resolve([] as PostRaw[]),
    db.post.findMany({
      where: {
        tenantId: { in: visibleTenantIds },
        tipo: 'MEMBRO',
        visibilidade: 'PUBLICO',
        oculto: false,
        autorId: { notIn: [...seguindoIds, userId] },
        ...cursorWhere,
      },
      orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
      take: takeSugeridos + 1,
      include: postInclude(userId),
    }) as Promise<PostRaw[]>,
  ])

  const postsSeguindoTyped: PostSocialItem[] = postsSeguindoRaw.map(projetarPost)
  const postsSugeridosTyped: PostSocialItem[] = postsSugeridosRaw.map(projetarPost)

  const hasMoreSeguindo = postsSeguindoTyped.length > takeSeguindo
  const hasMoreSugeridos = postsSugeridosTyped.length > takeSugeridos
  const postsSeguindo = postsSeguindoTyped.slice(0, takeSeguindo)
  const postsSugeridos = postsSugeridosTyped
    .slice(0, takeSugeridos)
    .filter((post: PostSocialItem) => !seguindoSet.has(post.autorId))

  const merged = [...postsSeguindo, ...postsSugeridos].sort(sortPostsDesc).slice(0, take)
  const hasMore = hasMoreSeguindo || hasMoreSugeridos
  const nextCursor = hasMore && merged.length > 0 ? encodeCursor(merged[merged.length - 1]) : null

  return {
    announcements,
    postsSeguindo,
    postsSugeridos,
    noticias,
    pageInfo: { nextCursor, hasMore },
  }
}
