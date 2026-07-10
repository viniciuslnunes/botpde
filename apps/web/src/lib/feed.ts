import { cache } from 'react'
import { db } from '@torcida/db'
import { getFeedComunidade, type ComunicadoFeedItem } from './comunidade'
import { getVisibleTenantIds } from './hierarquia'
import { getAutoresSemAcesso, getContagensSeguimento, resolverAvatarSocial } from './perfil-social'
import type { TipoReacaoSocial } from './comunidade-social'

import { getNoticiasAprovadas, type NoticiaAprovadaItem } from './noticias'

interface FeedOpts {
  cursor?: string
  take?: number
  afiliacaoId?: string | null
}

type SeguimentoLite = { seguidoId: string }

export interface EnquetePostItem {
  id: string
  encerrada: boolean
  opcoes: Array<{ id: string; texto: string; votos: number }>
  meuVotoOpcaoId: string | null
  totalVotos: number
}

export interface PostOrigemEmbed {
  id: string
  conteudo: string
  autor: { id: string; nome: string | null; avatarUrl: string | null }
  midiaUrls: string[]
  oculto: boolean
}

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
  postOrigemId: string | null
  tenant: { nome: string }
  autor: { id: string; nome: string | null; avatarUrl: string | null }
  totalReacoes: number
  totalComentarios: number
  minhaReacao: TipoReacaoSocial | null
  postOrigem: PostOrigemEmbed | null
  enquete: EnquetePostItem | null
}

/** Shape cru do Prisma antes de projetar em PostSocialItem. */
export type PostRaw = Omit<
  PostSocialItem,
  'totalReacoes' | 'totalComentarios' | 'minhaReacao' | 'postOrigem' | 'enquete'
> & {
  _count: { reacoes: number; comentarios: number }
  reacoes: { tipo: TipoReacaoSocial }[]
  postOrigem?: {
    id: string
    conteudo: string
    oculto: boolean
    midiaUrls: string[]
    autor: { id: string; nome: string | null; avatarUrl: string | null }
  } | null
  enquete?: {
    id: string
    encerradaEm: Date | null
    opcoes: Array<{ id: string; texto: string; _count: { votos: number } }>
    votos: Array<{ opcaoId: string }>
  } | null
}

export function projetarEnquete(
  enquete: NonNullable<PostRaw['enquete']>,
): EnquetePostItem {
  const opcoes = enquete.opcoes.map((o) => ({
    id: o.id,
    texto: o.texto,
    votos: o._count.votos,
  }))
  const totalVotos = opcoes.reduce((s, o) => s + o.votos, 0)
  return {
    id: enquete.id,
    encerrada: enquete.encerradaEm !== null,
    opcoes,
    meuVotoOpcaoId: enquete.votos[0]?.opcaoId ?? null,
    totalVotos,
  }
}

export function projetarPost(post: PostRaw): PostSocialItem {
  const { _count, reacoes, postOrigem, enquete, ...rest } = post
  return {
    ...rest,
    totalReacoes: _count.reacoes,
    totalComentarios: _count.comentarios,
    minhaReacao: reacoes[0]?.tipo ?? null,
    postOrigem: postOrigem
      ? {
          id: postOrigem.id,
          conteudo: postOrigem.conteudo,
          oculto: postOrigem.oculto,
          midiaUrls: postOrigem.midiaUrls,
          autor: postOrigem.autor,
        }
      : null,
    enquete: enquete ? projetarEnquete(enquete) : null,
  }
}

export function postInclude(userId?: string) {
  return {
    tenant: { select: { nome: true } },
    autor: { select: { id: true, nome: true, avatarUrl: true } },
    postOrigem: {
      select: {
        id: true,
        conteudo: true,
        oculto: true,
        midiaUrls: true,
        autor: { select: { id: true, nome: true, avatarUrl: true } },
      },
    },
    enquete: {
      select: {
        id: true,
        encerradaEm: true,
        opcoes: {
          orderBy: { ordem: 'asc' as const },
          select: { id: true, texto: true, _count: { select: { votos: true } } },
        },
        votos: userId
          ? { where: { userId }, select: { opcaoId: true }, take: 1 }
          : ({ where: { id: '' }, select: { opcaoId: true }, take: 1 } as const),
      },
    },
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
      take: (take + 1) * 3,
      include: postInclude(),
    })) as PostRaw[]
    const sugeridos: PostSocialItem[] = sugeridosRaw.map(projetarPost)
    const autorIds = sugeridos.map((p) => p.autorId)
    const semAcesso = await getAutoresSemAcesso(undefined, tenantId, autorIds)
    const visiveis = sugeridos.filter((p) => !semAcesso.has(p.autorId))
    const slice = visiveis.slice(0, take)
    const hasMore = visiveis.length > take
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
  let ordenados = [...dedup.values()].sort(sortPostsDesc)

  const autorIdsExternos = ordenados.filter((p) => !redeSet.has(p.autorId)).map((p) => p.autorId)
  const semAcesso = await getAutoresSemAcesso(userId, tenantId, autorIdsExternos)
  ordenados = ordenados.filter((p) => redeSet.has(p.autorId) || !semAcesso.has(p.autorId))

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
export interface SugestaoAutorAside {
  id: string
  nome: string | null
  avatarUrl: string | null
  seguidores: number
}

export const getSugestoesAutoresParaAside = cache(async function getSugestoesAutoresParaAside(
  tenantId: string,
  userId: string,
): Promise<SugestaoAutorAside[]> {
  const [visibleTenantIds, seguindo]: [string[], SeguimentoLite[]] = await Promise.all([
    getVisibleTenantIds(tenantId, 'comunidade'),
    db.seguimento.findMany({
      where: { seguidorId: userId, status: 'APROVADO' },
      select: { seguidoId: true },
    }),
  ])
  const redeIds = [userId, ...seguindo.map((s) => s.seguidoId)]

  const perfisPublicos: Array<{
    userId: string
    avatarUrl: string | null
    user: { id: string; nome: string | null; avatarUrl: string | null }
  }> = await db.perfilMembro.findMany({
    where: {
      tenantId,
      perfilPrivado: false,
      userId: { notIn: redeIds },
    },
    take: 8,
    orderBy: { atualizadoEm: 'desc' },
    select: {
      userId: true,
      avatarUrl: true,
      user: { select: { id: true, nome: true, avatarUrl: true } },
    },
  })

  if (perfisPublicos.length > 0) {
    const result: SugestaoAutorAside[] = []
    for (const p of perfisPublicos.slice(0, 4)) {
      const contagens = await getContagensSeguimento(p.userId, tenantId)
      result.push({
        id: p.user.id,
        nome: p.user.nome,
        avatarUrl: resolverAvatarSocial(p.avatarUrl, p.user.avatarUrl),
        seguidores: contagens.seguidores,
      })
    }
    return result
  }

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

  const autorIds = posts.map((p) => p.autor.id)
  const semAcesso = await getAutoresSemAcesso(userId, tenantId, autorIds)
  const result: SugestaoAutorAside[] = []
  for (const p of posts) {
    if (semAcesso.has(p.autor.id)) continue
    const contagens = await getContagensSeguimento(p.autor.id, tenantId)
    result.push({
      id: p.autor.id,
      nome: p.autor.nome,
      avatarUrl: p.autor.avatarUrl,
      seguidores: contagens.seguidores,
    })
    if (result.length >= 4) break
  }
  return result
})

export interface GrupoPublicoItem {
  id: string
  nome: string | null
  descricao: string | null
  membros: number
  souMembro: boolean
}

export interface DestaquePerfilItem {
  id: string
  titulo: string
  capaUrl: string | null
  postIds: string[]
}

export async function getPostsPorHashtag(
  tenantId: string,
  tag: string,
  userId?: string,
): Promise<{ tag: string; posts: PostSocialItem[] }> {
  const { normalizarHashtag } = await import('./comunidade-social')
  const normalized = normalizarHashtag(tag)
  const visibleTenantIds = await getVisibleTenantIds(tenantId, 'comunidade')

  const hashtags: Array<{ id: string }> = await db.hashtag.findMany({
    where: { tenantId: { in: visibleTenantIds }, tag: normalized },
    select: { id: true },
  })
  if (hashtags.length === 0) return { tag: normalized, posts: [] }

  const postsRaw = (await db.post.findMany({
    where: {
      tenantId: { in: visibleTenantIds },
      tipo: 'MEMBRO',
      oculto: false,
      visibilidade: 'PUBLICO',
      hashtags: { some: { hashtagId: { in: hashtags.map((h) => h.id) } } },
    },
    orderBy: { criadoEm: 'desc' },
    take: 30,
    include: postInclude(userId),
  })) as PostRaw[]

  let posts = postsRaw.map(projetarPost)
  if (userId) {
    const autorIds = posts.map((p) => p.autorId)
    const semAcesso = await getAutoresSemAcesso(userId, tenantId, autorIds)
    posts = posts.filter((p) => !semAcesso.has(p.autorId))
  }

  return { tag: normalized, posts }
}

export async function getPostsComVideo(
  tenantId: string,
  userId?: string,
): Promise<PostSocialItem[]> {
  const { isVideoUrl } = await import('./comunidade-social')
  const visibleTenantIds = await getVisibleTenantIds(tenantId, 'comunidade')

  const postsRaw = (await db.post.findMany({
    where: {
      tenantId: { in: visibleTenantIds },
      tipo: 'MEMBRO',
      oculto: false,
      visibilidade: 'PUBLICO',
    },
    orderBy: { criadoEm: 'desc' },
    take: 80,
    include: postInclude(userId),
  })) as PostRaw[]

  let posts = postsRaw
    .map(projetarPost)
    .filter(
      (p) =>
        p.midiaUrls.some(isVideoUrl) ||
        (p.imagemUrl != null && isVideoUrl(p.imagemUrl)),
    )
    .slice(0, 30)

  if (userId) {
    const autorIds = posts.map((p) => p.autorId)
    const semAcesso = await getAutoresSemAcesso(userId, tenantId, autorIds)
    posts = posts.filter((p) => !semAcesso.has(p.autorId))
  }

  return posts
}

export async function getGruposPublicos(
  tenantId: string,
  userId?: string,
): Promise<GrupoPublicoItem[]> {
  const rows: Array<{
    id: string
    nome: string | null
    descricao: string | null
    _count: { membros: number }
    membros: Array<{ id: string }>
  }> = await db.conversa.findMany({
    where: { tenantId, tipo: 'GRUPO', publica: true },
    orderBy: { atualizadoEm: 'desc' },
    take: 50,
    select: {
      id: true,
      nome: true,
      descricao: true,
      _count: { select: { membros: true } },
      membros: userId
        ? { where: { userId, saiuEm: null }, select: { id: true }, take: 1 }
        : { where: { id: '' }, select: { id: true }, take: 0 },
    },
  })

  return rows.map((g) => ({
    id: g.id,
    nome: g.nome,
    descricao: g.descricao,
    membros: g._count.membros,
    souMembro: g.membros.length > 0,
  }))
}

export async function getDestaquesPerfil(
  userId: string,
  tenantId: string,
): Promise<DestaquePerfilItem[]> {
  const rows: Array<{
    id: string
    titulo: string
    capaUrl: string | null
    itens: Array<{ postId: string; post: { midiaUrls: string[]; imagemUrl: string | null } }>
  }> = await db.perfilDestaque.findMany({
    where: { userId, tenantId },
    orderBy: { ordem: 'asc' },
    select: {
      id: true,
      titulo: true,
      capaUrl: true,
      itens: {
        orderBy: { ordem: 'asc' },
        select: {
          postId: true,
          post: { select: { midiaUrls: true, imagemUrl: true } },
        },
      },
    },
  })

  return rows.map((d) => ({
    id: d.id,
    titulo: d.titulo,
    capaUrl:
      d.capaUrl ??
      d.itens[0]?.post.midiaUrls[0] ??
      d.itens[0]?.post.imagemUrl ??
      null,
    postIds: d.itens.map((i) => i.postId),
  }))
}

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
