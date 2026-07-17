import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { db } from '@torcida/db'
import { getFeedComunidade, type ComunicadoFeedItem } from './comunidade'
import { tagFeedDescobrir, tagFeedHashtags, tagFeedSugestoes } from './comunidade-cache'
import { getTenantIdsPorAfiliacao } from './comunidade-contexto'
import { getVisibleTenantIds } from './hierarquia'
import {
  getAutoresSemAcesso,
  getContagensSeguimentoEmLote,
  resolverAvatarSocial,
  podeVerConteudoSocial,
  resolverPerfilPrivadoEfetivo,
  type VinculoPrivacidadePerfil,
} from './perfil-social'
import { getSeguimentoStatus } from './social'
import type { TipoReacaoSocial } from './comunidade-social'
import { enriquecerPostsComBadges } from './autor-badges'
import { garantirTimelineDaRedeDoViewer } from './feed-timeline'
import { formatNomeTorcida } from '@torcida/types'

import { getNoticiasAprovadas, type NoticiaAprovadaItem } from './noticias'

interface FeedOpts {
  cursor?: string
  take?: number
  afiliacaoId?: string | null
}

/** Posts do mural de grupo ficam fora do feed principal. */
const escopoFeedPrincipal = { conversaId: null } as const

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
  autor: { id: string; nome: string | null; nickname: string | null; avatarUrl: string | null }
  midiaUrls: string[]
  oculto: boolean
}

export interface ComunicadoOrigemEmbed {
  id: string
  titulo: string
  corpo: string
  prioridade: 'NORMAL' | 'IMPORTANTE' | 'URGENTE'
  tenantNome: string
  autorNome: string | null
}

export interface EventoPostEmbed {
  id: string
  titulo: string
  data: Date
  local: string | null
  meuRsvp: 'CONFIRMADO' | 'RECUSADO' | null
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
  fixado: boolean
  criadoEm: Date
  autorId: string
  postOrigemId: string | null
  comunicadoOrigemId: string | null
  eventoId: string | null
  tenant: { nome: string }
  autor: {
    id: string
    nome: string | null
    nickname: string | null
    avatarUrl: string | null
    sedeNome: string | null
    cargoNome: string | null
  }
  totalReacoes: number
  totalComentarios: number
  minhaReacao: TipoReacaoSocial | null
  postOrigem: PostOrigemEmbed | null
  comunicadoOrigem: ComunicadoOrigemEmbed | null
  evento: EventoPostEmbed | null
  enquete: EnquetePostItem | null
}

/** Shape cru do Prisma antes de projetar em PostSocialItem. */
export type PostRaw = Omit<
  PostSocialItem,
  | 'totalReacoes'
  | 'totalComentarios'
  | 'minhaReacao'
  | 'postOrigem'
  | 'comunicadoOrigem'
  | 'evento'
  | 'enquete'
> & {
  _count: { reacoes: number; comentarios: number }
  reacoes: { tipo: TipoReacaoSocial }[]
  postOrigem?: {
    id: string
    conteudo: string
    oculto: boolean
    midiaUrls: string[]
    autor: { id: string; nome: string | null; nickname: string | null; avatarUrl: string | null }
  } | null
  comunicadoOrigem?: {
    id: string
    titulo: string
    corpo: string
    prioridade: 'NORMAL' | 'IMPORTANTE' | 'URGENTE'
    tenant: { nome: string }
    autor: { nome: string | null }
  } | null
  evento?: {
    id: string
    titulo: string
    data: Date
    local: string | null
    rsvps: Array<{ status: 'CONFIRMADO' | 'RECUSADO' | 'TALVEZ' }>
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
  const { _count, reacoes, postOrigem, comunicadoOrigem, evento, enquete, autor, tenant, ...rest } =
    post
  return {
    ...rest,
    tenant: { nome: formatNomeTorcida(tenant.nome) },
    autor: {
      ...autor,
      sedeNome: null,
      cargoNome: null,
    },
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
    comunicadoOrigem: comunicadoOrigem
      ? {
          id: comunicadoOrigem.id,
          titulo: comunicadoOrigem.titulo,
          corpo: comunicadoOrigem.corpo,
          prioridade: comunicadoOrigem.prioridade,
          tenantNome: formatNomeTorcida(comunicadoOrigem.tenant.nome),
          autorNome: comunicadoOrigem.autor.nome,
        }
      : null,
    evento: evento
      ? {
          id: evento.id,
          titulo: evento.titulo,
          data: evento.data,
          local: evento.local,
          meuRsvp: (evento.rsvps[0]?.status as 'CONFIRMADO' | 'RECUSADO') ?? null,
        }
      : null,
    enquete: enquete ? projetarEnquete(enquete) : null,
  }
}

export function postInclude(userId?: string) {
  return {
    tenant: { select: { nome: true } },
    autor: { select: { id: true, nome: true, nickname: true, avatarUrl: true } },
    postOrigem: {
      select: {
        id: true,
        conteudo: true,
        oculto: true,
        midiaUrls: true,
        autor: { select: { id: true, nome: true, nickname: true, avatarUrl: true } },
      },
    },
    comunicadoOrigem: {
      select: {
        id: true,
        titulo: true,
        corpo: true,
        prioridade: true,
        tenant: { select: { nome: true } },
        autor: { select: { nome: true } },
      },
    },
    evento: {
      select: {
        id: true,
        titulo: true,
        data: true,
        local: true,
        rsvps: userId
          ? { where: { userId }, select: { status: true }, take: 1 }
          : ({ where: { id: '' }, select: { status: true }, take: 0 } as const),
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

function encodeCursor(post: { id: string; criadoEm: Date | string }): string {
  const criadoEm = post.criadoEm instanceof Date ? post.criadoEm : new Date(post.criadoEm)
  return Buffer.from(
    JSON.stringify({
      id: post.id,
      criadoEmIso: criadoEm.toISOString(),
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

function buildTimelineCursorWhere(cursor: FeedCursor | null) {
  if (!cursor) return undefined
  const data = new Date(cursor.criadoEmIso)
  if (Number.isNaN(data.getTime())) return undefined
  return {
    OR: [{ criadoEm: { lt: data } }, { criadoEm: data, postId: { lt: cursor.id } }],
  }
}

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value)
}

function sortPostsDesc(a: { criadoEm: Date | string }, b: { criadoEm: Date | string }): number {
  return asDate(b.criadoEm).getTime() - asDate(a.criadoEm).getTime()
}

function scoreDescobrirPost(post: PostSocialItem, tenantId: string): number {
  const now = Date.now()
  const ageHours = Math.max(0, (now - asDate(post.criadoEm).getTime()) / 3_600_000)
  const freshness = Math.max(0, 72 - ageHours) * 1.5
  const engagement = post.totalReacoes * 1.25 + post.totalComentarios * 2.25
  const localBoost = post.tenantId === tenantId ? 6 : 0
  const mediaBoost = post.midiaUrls.length > 0 || post.imagemUrl ? 1.5 : 0
  const pollBoost = post.enquete ? 2 : 0
  return freshness + engagement + localBoost + mediaBoost + pollBoost
}

function rankDescobrirPosts(posts: PostSocialItem[], tenantId: string): PostSocialItem[] {
  return [...posts].sort((a, b) => {
    const diff = scoreDescobrirPost(b, tenantId) - scoreDescobrirPost(a, tenantId)
    if (diff !== 0) return diff
    return sortPostsDesc(a, b)
  })
}

function revivePostSocialItem(post: PostSocialItem): PostSocialItem {
  return {
    ...post,
    criadoEm: asDate(post.criadoEm),
    evento: post.evento ? { ...post.evento, data: asDate(post.evento.data) } : null,
  }
}

/** Candidatos públicos do Descobrir — sem estado do viewer (reação/voto/RSVP). */
async function getDescobrirPostsBaseCached(
  tenantId: string,
  visibleTenantIds: string[],
  cursor: FeedCursor | null,
  fetchLimit: number,
): Promise<PostSocialItem[]> {
  const visibleTenantIdsKey = [...visibleTenantIds].sort().join(',')
  const cursorKey = cursor ? `${cursor.criadoEmIso}:${cursor.id}` : 'start'

  const cached = await unstable_cache(
    async () => {
      const cursorWhere = buildCursorWhere(cursor)
      const postsRaw = (await db.post.findMany({
        where: {
          tenantId: { in: visibleTenantIds },
          tipo: 'MEMBRO',
          visibilidade: 'PUBLICO',
          oculto: false,
          ...escopoFeedPrincipal,
          ...cursorWhere,
        },
        orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
        take: fetchLimit,
        include: postInclude(),
      })) as PostRaw[]
      return postsRaw.map(projetarPost)
    },
    ['feed-descobrir-base', tenantId, visibleTenantIdsKey, cursorKey, String(fetchLimit)],
    { revalidate: 60, tags: [tagFeedDescobrir(tenantId)] },
  )()

  return cached.map(revivePostSocialItem)
}

async function hidratarPostsDoUsuario(
  posts: PostSocialItem[],
  userId: string,
): Promise<PostSocialItem[]> {
  if (posts.length === 0) return posts

  const ids = posts.map((p) => p.id)
  const postsRaw = (await db.post.findMany({
    where: { id: { in: ids } },
    include: postInclude(userId),
  })) as PostRaw[]

  const porId = new Map(postsRaw.map((p) => [p.id, projetarPost(p)]))
  return posts.map((p) => porId.get(p.id) ?? p)
}

export async function finalizarPosts(posts: PostSocialItem[]): Promise<PostSocialItem[]> {
  return enriquecerPostsComBadges(posts)
}

async function resolveVisibleTenantIdsForFeed(
  tenantId: string,
  userId: string | undefined,
): Promise<string[]> {
  const base = await getVisibleTenantIds(tenantId, 'comunidade')

  const tenant: { afiliacaoId: string | null } | null = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { afiliacaoId: true },
  })

  // Posts de torcedor global (tenant sintético do clube) entram como sugestão
  // no feed de qualquer sócio da torcida — mesmo sem vínculo pendente.
  let comSintetico = base
  if (tenant?.afiliacaoId) {
    const sintetico: { id: string } | null = await db.tenant.findFirst({
      where: { afiliacaoId: tenant.afiliacaoId, sintetico: true },
      select: { id: true },
    })
    if (sintetico) comSintetico = [...new Set([...base, sintetico.id])]
  }

  if (!userId) return comSintetico

  const membro: { status: string } | null = await db.saasMembro.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
    select: { status: true },
  })
  if (membro?.status === 'APROVADO') return comSintetico

  if (!tenant?.afiliacaoId) return comSintetico

  const siblings: { id: string }[] = await db.tenant.findMany({
    where: { afiliacaoId: tenant.afiliacaoId, ativo: true, sintetico: false },
    select: { id: true },
  })
  return [...new Set([...comSintetico, ...siblings.map((s) => s.id)])]
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
    resolveVisibleTenantIdsForFeed(tenantId, userId),
    userId
      ? db.seguimento.findMany({
          where: { seguidorId: userId, status: 'APROVADO' },
          select: { seguidoId: true },
        })
      : Promise.resolve([] as SeguimentoLite[]),
  ])

  const fetchLimit = (take + 1) * 3

  if (!userId) {
    const sugeridos = await getDescobrirPostsBaseCached(
      tenantId,
      visibleTenantIds,
      decodedCursor,
      fetchLimit,
    )
    const autorIds = sugeridos.map((p) => p.autorId)
    const semAcesso = await getAutoresSemAcesso(undefined, tenantId, autorIds)
    const visiveis = sugeridos.filter((p) => !semAcesso.has(p.autorId))
    const ranqueados = rankDescobrirPosts(visiveis, tenantId)
    const slice = await finalizarPosts(ranqueados.slice(0, take))
    const hasMore = ranqueados.length > take
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

  const [postsRedeRaw, discoverBase] = await Promise.all([
    db.post.findMany({
      where: {
        tenantId: { in: visibleTenantIds },
        tipo: 'MEMBRO',
        oculto: false,
        ...escopoFeedPrincipal,
        ...cursorWhere,
        autorId: { in: redeIds },
      },
      orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
      take: take + 1,
      include: postInclude(userId),
    }) as Promise<PostRaw[]>,
    getDescobrirPostsBaseCached(tenantId, visibleTenantIds, decodedCursor, fetchLimit),
  ])

  const seguindoOrdenados = postsRedeRaw.map(projetarPost).sort(sortPostsDesc)

  const discoverExternos = discoverBase.filter((p) => !redeSet.has(p.autorId))
  const autorIdsExternos = discoverExternos.map((p) => p.autorId)
  const semAcesso = await getAutoresSemAcesso(userId, tenantId, autorIdsExternos)
  const discoverVisiveis = discoverExternos.filter((p) => !semAcesso.has(p.autorId))
  const sugeridosOrdenados = rankDescobrirPosts(discoverVisiveis, tenantId)

  const candidatos = [...sugeridosOrdenados, ...seguindoOrdenados]
  const hasMore = candidatos.length > take
  const paginaBruta = candidatos.slice(0, take)
  const pagina = await finalizarPosts(await hidratarPostsDoUsuario(paginaBruta, userId))
  const nextCursor = hasMore && pagina.length > 0 ? encodeCursor(pagina[pagina.length - 1]) : null

  return {
    postsSeguindo: pagina.filter((post) => redeSet.has(post.autorId)),
    postsSugeridos: pagina.filter((post) => !redeSet.has(post.autorId)),
    pageInfo: { nextCursor, hasMore },
  }
})

export const getComunicadosParaFeed = cache(async function getComunicadosParaFeed(tenantId: string, userId?: string) {
  const visibleTenantIds = await resolveVisibleTenantIdsForFeed(tenantId, userId)
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

interface SugestaoAutorBaseRow {
  userId: string
  nome: string | null
  avatarUrl: string | null
  seguidores: number
}

async function getSugestoesAutoresBaseCached(
  tenantId: string,
  visibleTenantIds: string[],
): Promise<SugestaoAutorBaseRow[]> {
  const visibleTenantIdsKey = [...visibleTenantIds].sort().join(',')

  return unstable_cache(
    async () => {
      const posts: Array<{ autor: { id: string; nome: string | null; avatarUrl: string | null } }> =
        await db.post.findMany({
          where: {
            tenantId: { in: visibleTenantIds },
            tipo: 'MEMBRO',
            visibilidade: 'PUBLICO',
            oculto: false,
            ...escopoFeedPrincipal,
          },
          orderBy: { criadoEm: 'desc' },
          take: 24,
          distinct: ['autorId'],
          select: {
            autor: { select: { id: true, nome: true, avatarUrl: true } },
          },
        })

      const autorIds = posts.map((p) => p.autor.id)
      const contagensMap = await getContagensSeguimentoEmLote(autorIds, tenantId)

      return posts.map((p) => {
        const contagens = contagensMap.get(p.autor.id) ?? { seguidores: 0, seguindo: 0, publicacoes: 0 }
        return {
          userId: p.autor.id,
          nome: p.autor.nome,
          avatarUrl: p.autor.avatarUrl,
          seguidores: contagens.seguidores,
        }
      })
    },
    ['feed-sugestoes-base', tenantId, visibleTenantIdsKey],
    { revalidate: 120, tags: [tagFeedSugestoes(tenantId)] },
  )()
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

  const sugestoes: SugestaoAutorAside[] = []
  const candidatosDePerfil = perfisPublicos.slice(0, 4)
  if (candidatosDePerfil.length > 0) {
    // Proteção extra contra dados antigos: filtra por privacidade efetiva (sócio aprovado pode ter perfil_privado=false no banco).
    const memberInfos: Array<NonNullable<VinculoPrivacidadePerfil> & {
      userId: string
    }> = await db.saasMembro.findMany({
      where: {
        tenantId,
        userId: { in: candidatosDePerfil.map((p) => p.userId) },
      },
      select: { userId: true, tipo: true, status: true },
    })
    const memberMap = new Map(memberInfos.map((m) => [m.userId, m]))

    const candidatosEfetivamentePublicos = candidatosDePerfil.filter((p) => {
      const membro = memberMap.get(p.userId) ?? null
      return !resolverPerfilPrivadoEfetivo(false, membro ? { tipo: membro.tipo, status: membro.status } : null)
    })

    const contagensMap = await getContagensSeguimentoEmLote(
      candidatosEfetivamentePublicos.map((p) => p.userId),
      tenantId,
    )
    for (const p of candidatosEfetivamentePublicos) {
      const contagens = contagensMap.get(p.userId) ?? { seguidores: 0, seguindo: 0, publicacoes: 0 }
      sugestoes.push({
        id: p.user.id,
        nome: p.user.nome,
        avatarUrl: resolverAvatarSocial(p.avatarUrl, p.user.avatarUrl),
        seguidores: contagens.seguidores,
      })
    }
  }

  // Torcedores podem ser públicos mesmo se ainda não tiverem PerfilMembro criado
  // (ex.: antes do backfill). Preenche sugestões com torcedores aprovados.
  if (sugestoes.length < 4) {
    const jaIndicados = new Set(sugestoes.map((s) => s.id))
    const restantes = 4 - sugestoes.length
    const candidatosTorcedores: Array<{
      userId: string
      user: { id: string; nome: string | null; avatarUrl: string | null }
    }> = await db.saasMembro.findMany({
      where: {
        tenantId,
        tipo: 'TORCEDOR',
        status: 'APROVADO',
        userId: { notIn: [...redeIds, ...jaIndicados] },
      },
      orderBy: { criadoEm: 'desc' },
      take: restantes,
      select: {
        userId: true,
        user: { select: { id: true, nome: true, avatarUrl: true } },
      },
    })

    if (candidatosTorcedores.length > 0) {
      const contagensMap = await getContagensSeguimentoEmLote(
        candidatosTorcedores.map((m) => m.userId),
        tenantId,
      )
      for (const m of candidatosTorcedores) {
        const contagens = contagensMap.get(m.userId) ?? { seguidores: 0, seguindo: 0, publicacoes: 0 }
        sugestoes.push({
          id: m.user.id,
          nome: m.user.nome,
          avatarUrl: m.user.avatarUrl,
          seguidores: contagens.seguidores,
        })
      }
    }
  }

  if (sugestoes.length > 0) return sugestoes

  const sugestoesBase = await getSugestoesAutoresBaseCached(tenantId, visibleTenantIds)
  const posts = sugestoesBase
    .filter((p) => !redeIds.includes(p.userId))
    .map((p) => ({ autor: { id: p.userId, nome: p.nome, avatarUrl: p.avatarUrl } }))

  const autorIds = posts.map((p) => p.autor.id)
  const semAcesso = await getAutoresSemAcesso(userId, tenantId, autorIds)
  const elegiveis = posts.filter((p) => !semAcesso.has(p.autor.id)).slice(0, 4)
  const baseMap = new Map(sugestoesBase.map((item) => [item.userId, item]))
  return elegiveis.map((p) => {
    const base = baseMap.get(p.autor.id)
    return {
      id: p.autor.id,
      nome: p.autor.nome,
      avatarUrl: p.autor.avatarUrl,
      seguidores: base?.seguidores ?? 0,
    }
  })
})

export interface GrupoPublicoItem {
  id: string
  nome: string | null
  descricao: string | null
  membros: number
  souMembro: boolean
}

export interface GrupoDetalheItem extends GrupoPublicoItem {
  souAdmin: boolean
  publica: boolean
}

export interface DestaquePerfilItem {
  id: string
  titulo: string
  capaUrl: string | null
  postIds: string[]
  posts: PostSocialItem[]
}

export interface HashtagEmAlta {
  tag: string
  total: number
}

/**
 * Gate do feed de sócios: só vínculo APROVADO no tenant libera posts TENANT.
 * PENDENTE/REPROVADO/sem vínculo → só feed de torcedor (ver spec §3.1).
 */
export const podeVerFeedSocios = cache(
  async (userId: string | undefined, tenantId: string): Promise<boolean> => {
    if (!userId) return false
    const membro: { status: string } | null = await db.saasMembro.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { status: true },
    })
    return membro?.status === 'APROVADO'
  },
)

/** Verifica se o viewer pode abrir o post (perfil + visibilidade do post). */
export async function podeVerPost(
  viewerId: string,
  post: {
    autorId: string
    tenantId: string
    visibilidade: 'PUBLICO' | 'TENANT' | 'PRIVADO'
    oculto: boolean
  },
): Promise<boolean> {
  if (post.oculto) return false
  if (!(await podeVerConteudoSocial(viewerId, post.autorId, post.tenantId))) return false
  if (viewerId === post.autorId) return true
  if (post.visibilidade === 'PUBLICO') return true
  if (post.visibilidade === 'TENANT') {
    // TODO(onboarding): aplicar podeVerFeedSocios no where — ver spec §3.1
    return podeVerFeedSocios(viewerId, post.tenantId)
  }
  const status = await getSeguimentoStatus(viewerId, post.autorId)
  return status === 'APROVADO'
}

type PostVisibilidadeInput = {
  autorId: string
  tenantId: string
  visibilidade: 'PUBLICO' | 'TENANT' | 'PRIVADO'
  oculto?: boolean
}

/** Filtra posts visíveis ao viewer em batch (perfil + visibilidade do post). */
export async function filtrarPostsVisiveis<T extends PostVisibilidadeInput>(
  viewerId: string,
  posts: T[],
): Promise<T[]> {
  if (posts.length === 0) return []

  const porTenant = new Map<string, string[]>()
  for (const post of posts) {
    if (post.oculto === true) continue
    const ids = porTenant.get(post.tenantId) ?? []
    ids.push(post.autorId)
    porTenant.set(post.tenantId, ids)
  }

  const bloqueados = new Set<string>()
  await Promise.all(
    [...porTenant.entries()].map(async ([tenantId, autorIds]) => {
      const semAcesso = await getAutoresSemAcesso(viewerId, tenantId, autorIds)
      for (const autorId of semAcesso) bloqueados.add(`${tenantId}:${autorId}`)
    }),
  )

  const candidatos = posts.filter(
    (p) => p.oculto !== true && !bloqueados.has(`${p.tenantId}:${p.autorId}`),
  )
  if (candidatos.length === 0) return []

  const privadoAutorIds = [
    ...new Set(
      candidatos.filter((p) => p.visibilidade === 'PRIVADO' && p.autorId !== viewerId).map((p) => p.autorId),
    ),
  ]
  const seguimentosAprovados = new Set<string>()
  if (privadoAutorIds.length > 0) {
    const rows: Array<{ seguidoId: string }> = await db.seguimento.findMany({
      where: { seguidorId: viewerId, seguidoId: { in: privadoAutorIds }, status: 'APROVADO' },
      select: { seguidoId: true },
    })
    for (const row of rows) seguimentosAprovados.add(row.seguidoId)
  }

  const tenantIdsSocio = [
    ...new Set(
      candidatos.filter((p) => p.visibilidade === 'TENANT' && p.autorId !== viewerId).map((p) => p.tenantId),
    ),
  ]
  const podeSocioPorTenant = new Map<string, boolean>()
  await Promise.all(
    tenantIdsSocio.map(async (tenantId) => {
      podeSocioPorTenant.set(tenantId, await podeVerFeedSocios(viewerId, tenantId))
    }),
  )

  return candidatos.filter((post) => {
    if (viewerId === post.autorId) return true
    if (post.visibilidade === 'PUBLICO') return true
    if (post.visibilidade === 'TENANT') return podeSocioPorTenant.get(post.tenantId) ?? false
    return seguimentosAprovados.has(post.autorId)
  })
}

export async function getPostPorId(
  postId: string,
  tenantId: string,
  viewerId: string,
): Promise<PostSocialItem | null> {
  const visibleTenantIds = await getVisibleTenantIds(tenantId, 'comunidade')
  const raw: PostRaw | null = (await db.post.findFirst({
    where: {
      id: postId,
      tenantId: { in: visibleTenantIds },
      tipo: 'MEMBRO',
      oculto: false,
    },
    include: postInclude(viewerId),
  })) as PostRaw | null
  if (!raw) return null
  const post = projetarPost(raw)
  const ok = await podeVerPost(viewerId, {
    autorId: post.autorId,
    tenantId: post.tenantId,
    visibilidade: post.visibilidade,
    oculto: false,
  })
  return ok ? (await finalizarPosts([post]))[0] ?? null : null
}

export const getPostsDaRede = cache(async function getPostsDaRede(
  tenantId: string,
  userId: string,
  opts: FeedOpts = {},
): Promise<{ posts: PostSocialItem[]; pageInfo: FeedPersonalizadoResult['pageInfo'] }> {
  const take = Math.min(Math.max(opts.take ?? 20, 5), 50)
  const decodedCursor = decodeCursor(opts.cursor)
  const cursorWhere = buildTimelineCursorWhere(decodedCursor)

  const visibleTenantIds = await getVisibleTenantIds(tenantId, 'comunidade')
  await garantirTimelineDaRedeDoViewer(userId)

  const batchSize = Math.max((take + 1) * 3, 24)
  let timelineCursor = decodedCursor
  let hasMoreTimeline = true
  let loops = 0
  const ordenados: PostSocialItem[] = []
  const seen = new Set<string>()

  while (ordenados.length < take + 1 && hasMoreTimeline && loops < 4) {
    const timelineRows: Array<{ postId: string; criadoEm: Date }> = await db.feedTimeline.findMany({
      where: {
        viewerId: userId,
        ...(loops === 0 ? cursorWhere : buildTimelineCursorWhere(timelineCursor)),
      },
      orderBy: [{ criadoEm: 'desc' }, { postId: 'desc' }],
      take: batchSize,
      select: { postId: true, criadoEm: true },
    })

    if (timelineRows.length === 0) {
      hasMoreTimeline = false
      break
    }

    const postsRaw = (await db.post.findMany({
      where: {
        id: { in: timelineRows.map((row) => row.postId) },
        tenantId: { in: visibleTenantIds },
        tipo: 'MEMBRO',
        oculto: false,
        ...escopoFeedPrincipal,
      },
      include: postInclude(userId),
    })) as PostRaw[]

    const byId = new Map(postsRaw.map((raw) => [raw.id, projetarPost(raw)]))
    for (const row of timelineRows) {
      const post = byId.get(row.postId)
      if (!post || seen.has(post.id)) continue
      seen.add(post.id)
      ordenados.push(post)
      if (ordenados.length >= take + 1) break
    }

    hasMoreTimeline = timelineRows.length === batchSize
    const last = timelineRows[timelineRows.length - 1]
    timelineCursor = last ? { id: last.postId, criadoEmIso: last.criadoEm.toISOString() } : null
    loops += 1
  }

  const hasMore = ordenados.length > take || hasMoreTimeline
  const pagina = await finalizarPosts(ordenados.slice(0, take))

  return {
    posts: pagina,
    pageInfo: {
      hasMore,
      nextCursor: hasMore && pagina.length > 0 ? encodeCursor(pagina[pagina.length - 1]) : null,
    },
  }
})

/**
 * Feed da comunidade nacional: posts de torcedores (tenant sintético do clube,
 * sempre abertos) + posts de sócios só de quem o torcedor segue e está
 * APROVADO — sócio é sempre "privado" pro torcedor, independente da
 * visibilidade PUBLICO/TENANT/PRIVADO que ele escolheu no post.
 */
export const getPostsFeedNacional = cache(async function getPostsFeedNacional(
  afiliacaoId: string,
  userId: string | undefined,
  opts: FeedOpts = {},
): Promise<{ posts: PostSocialItem[]; pageInfo: FeedPersonalizadoResult['pageInfo'] }> {
  const take = Math.min(Math.max(opts.take ?? 20, 5), 50)
  const decodedCursor = decodeCursor(opts.cursor)
  const cursorWhere = buildCursorWhere(decodedCursor)

  const tenantIds = await getTenantIdsPorAfiliacao(afiliacaoId)
  if (tenantIds.length === 0) {
    return { posts: [], pageInfo: { hasMore: false, nextCursor: null } }
  }

  let seguindoAprovados: string[] = []
  if (userId) {
    const aprovados: SeguimentoLite[] = await db.seguimento.findMany({
      where: { seguidorId: userId, status: 'APROVADO' },
      select: { seguidoId: true },
    })
    seguindoAprovados = aprovados.map((s) => s.seguidoId)
  }

  const postsRaw = (await db.post.findMany({
    where: {
      tenantId: { in: tenantIds },
      tipo: 'MEMBRO',
      visibilidade: 'PUBLICO',
      oculto: false,
      ...escopoFeedPrincipal,
      ...cursorWhere,
      OR: [
        { tenant: { sintetico: true } },
        { autorId: { in: seguindoAprovados } },
        { alcanceNacional: true },
      ],
    },
    orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
    take: take + 1,
    include: postInclude(userId),
  })) as PostRaw[]

  const posts = postsRaw.map(projetarPost)
  const hasMore = posts.length > take
  const pagina = await finalizarPosts(posts.slice(0, take))

  return {
    posts: pagina,
    pageInfo: {
      hasMore,
      nextCursor: hasMore && pagina.length > 0 ? encodeCursor(pagina[pagina.length - 1]) : null,
    },
  }
})

export async function getHashtagsEmAlta(
  tenantId: string,
  limite = 5,
): Promise<HashtagEmAlta[]> {
  const visibleTenantIds = await getVisibleTenantIds(tenantId, 'comunidade')
  const visibleTenantIdsKey = [...visibleTenantIds].sort().join(',')

  const cached = await unstable_cache(
    async (): Promise<HashtagEmAlta[]> => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

      const grouped: Array<{ hashtagId: string; _count: { postId: number } }> = await db.postHashtag.groupBy({
        by: ['hashtagId'],
        where: {
          post: {
            criadoEm: { gte: since },
            oculto: false,
            visibilidade: 'PUBLICO',
            tenantId: { in: visibleTenantIds },
          },
        },
        _count: { postId: true },
      })

      const top = grouped.sort((a, b) => b._count.postId - a._count.postId).slice(0, limite)
      if (top.length === 0) return []

      const hashtags: Array<{ id: string; tag: string }> = await db.hashtag.findMany({
        where: { id: { in: top.map((g) => g.hashtagId) } },
        select: { id: true, tag: true },
      })
      const tagPorId = new Map(hashtags.map((h) => [h.id, h.tag]))

      return top
        .map((g) => ({ tag: tagPorId.get(g.hashtagId), total: g._count.postId }))
        .filter((h): h is HashtagEmAlta => h.tag != null)
    },
    ['feed-hashtags-alta', tenantId, visibleTenantIdsKey, String(limite)],
    { revalidate: 300, tags: [tagFeedHashtags(tenantId)] },
  )()

  return cached
}

export interface TorcidaComunidadePublica {
  tenant: {
    id: string
    nome: string
    slug: string
    logoUrl: string | null
    corPrimaria: string
  }
  posts: PostSocialItem[]
}

/**
 * Preview autenticado: posts Públicos de um tenant (não “Só torcida” / PRIVADO).
 * Sem gate de hierarquia/aliança — usado para avaliar recomendação de aliança.
 */
export const getPostsPublicosDoTenant = cache(async function getPostsPublicosDoTenant(
  targetTenantId: string,
  viewerUserId: string,
  viewerTenantId: string,
): Promise<TorcidaComunidadePublica | null> {
  const tenant: {
    id: string
    nome: string
    slug: string
    logoUrl: string | null
    corPrimaria: string
    torcidaConhecida: { logoUrl: string | null } | null
  } | null = await db.tenant.findFirst({
    where: { id: targetTenantId, ativo: true, sintetico: false },
    select: {
      id: true,
      nome: true,
      slug: true,
      logoUrl: true,
      corPrimaria: true,
      torcidaConhecida: { select: { logoUrl: true } },
    },
  })
  if (!tenant) return null

  const postsRaw = (await db.post.findMany({
    where: {
      tenantId: targetTenantId,
      oculto: false,
      visibilidade: 'PUBLICO',
      ...escopoFeedPrincipal,
    },
    orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
    take: 30,
    include: postInclude(viewerUserId),
  })) as PostRaw[]

  let posts = postsRaw.map(projetarPost)
  const autorIds = posts.map((p) => p.autorId)
  const semAcesso = await getAutoresSemAcesso(viewerUserId, viewerTenantId, autorIds)
  posts = posts.filter((p) => !semAcesso.has(p.autorId))

  return {
    tenant: {
      id: tenant.id,
      nome: formatNomeTorcida(tenant.nome),
      slug: tenant.slug,
      logoUrl: tenant.torcidaConhecida?.logoUrl ?? tenant.logoUrl,
      corPrimaria: tenant.corPrimaria,
    },
    posts: await finalizarPosts(posts),
  }
})

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
      ...escopoFeedPrincipal,
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

  return { tag: normalized, posts: await finalizarPosts(posts) }
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
      ...escopoFeedPrincipal,
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

  return finalizarPosts(posts)
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

export async function getGrupoPorId(
  conversaId: string,
  tenantId: string,
  userId: string,
): Promise<GrupoDetalheItem | null> {
  const row: {
    id: string
    nome: string | null
    descricao: string | null
    publica: boolean
    _count: { membros: number }
    membros: Array<{ papel: 'ADMIN' | 'MEMBRO' }>
  } | null = await db.conversa.findFirst({
    where: { id: conversaId, tenantId, tipo: 'GRUPO' },
    select: {
      id: true,
      nome: true,
      descricao: true,
      publica: true,
      _count: { select: { membros: { where: { saiuEm: null } } } },
      membros: {
        where: { userId, saiuEm: null },
        select: { papel: true },
        take: 1,
      },
    },
  })
  if (!row) return null

  const membro = row.membros[0]
  if (!membro && !row.publica) return null

  return {
    id: row.id,
    nome: row.nome,
    descricao: row.descricao,
    membros: row._count.membros,
    souMembro: Boolean(membro),
    souAdmin: membro?.papel === 'ADMIN',
    publica: row.publica,
  }
}

export async function getPostsDoGrupo(
  conversaId: string,
  tenantId: string,
  userId: string,
): Promise<PostSocialItem[]> {
  const membro: { id: string } | null = await db.membroConversa.findFirst({
    where: { conversaId, userId, saiuEm: null },
    select: { id: true },
  })
  if (!membro) return []

  const postsRaw = (await db.post.findMany({
    where: { conversaId, tenantId, oculto: false },
    orderBy: { criadoEm: 'desc' },
    take: 50,
    include: postInclude(userId),
  })) as PostRaw[]

  const posts = postsRaw.map(projetarPost)
  return finalizarPosts(posts)
}

export async function getPostIdsSalvos(userId: string, tenantId: string): Promise<Set<string>> {
  const rows: Array<{ postId: string }> = await db.postSalvo.findMany({
    where: { userId, tenantId },
    select: { postId: true },
  })
  return new Set(rows.map((r) => r.postId))
}

export async function getPostsSalvos(
  tenantId: string,
  userId: string,
): Promise<PostSocialItem[]> {
  const salvoRows: Array<{ postId: string }> = await db.postSalvo.findMany({
    where: { userId, tenantId },
    orderBy: { criadoEm: 'desc' },
    take: 50,
    select: { postId: true },
  })
  if (salvoRows.length === 0) return []

  const visibleTenantIds = await getVisibleTenantIds(tenantId, 'comunidade')
  const postsRaw = (await db.post.findMany({
    where: {
      id: { in: salvoRows.map((r) => r.postId) },
      tenantId: { in: visibleTenantIds },
      oculto: false,
    },
    include: postInclude(userId),
  })) as PostRaw[]

  const byId = new Map(postsRaw.map((r) => [r.id, projetarPost(r)]))
  const ordenados = salvoRows
    .map((row) => byId.get(row.postId))
    .filter((p): p is PostSocialItem => p != null)
  const visiveis = await filtrarPostsVisiveis(userId, ordenados)
  return finalizarPosts(visiveis)
}

export async function getDestaquesPerfil(
  userId: string,
  tenantId: string,
  viewerId?: string,
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

  const postIds = [...new Set(rows.flatMap((d) => d.itens.map((i) => i.postId)))]
  const postsMap = new Map<string, PostSocialItem>()

  if (viewerId && postIds.length > 0) {
    const visibleTenantIds = await getVisibleTenantIds(tenantId, 'comunidade')
    const postsRaw = (await db.post.findMany({
      where: {
        id: { in: postIds },
        tenantId: { in: visibleTenantIds },
        oculto: false,
      },
      include: postInclude(viewerId),
    })) as PostRaw[]

    const projetados = postsRaw.map(projetarPost)
    const visiveis = await filtrarPostsVisiveis(viewerId, projetados)
    for (const post of visiveis) postsMap.set(post.id, post)
  }

  return rows.map((d) => ({
    id: d.id,
    titulo: d.titulo,
    capaUrl:
      d.capaUrl ??
      d.itens[0]?.post.midiaUrls[0] ??
      d.itens[0]?.post.imagemUrl ??
      null,
    postIds: d.itens.map((i) => i.postId),
    posts: d.itens
      .map((i) => postsMap.get(i.postId))
      .filter((p): p is PostSocialItem => p != null),
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
