import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { db, Prisma } from '@torcida/db'
import { getFeedComunidade, type ComunicadoFeedItem } from './comunidade'
import { tagFeedDescobrir, tagFeedHashtags, tagFeedSugestoes, tagFeedNacional } from './comunidade-cache'
import { getTenantIdsPorAfiliacao } from './comunidade-contexto'
import {
  getAncestorTenantIds,
  getDescendantTenantIds,
  getVisibleTenantIds,
} from './hierarquia'
import {
  ISOLAMENTO_CACHE_TAG,
  filtrarTenantsRestritos,
  isTenantRestrito,
} from './isolamento'
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
import { isSuperAdminEmail } from './tenant-context'
import { formatNomeTorcida } from '@torcida/types'
import { durableImageUrl, filterDurableImageUrls } from '@/lib/optimizable-image'
import { compactOr } from '@/lib/prisma-filters'

import { getNoticiasAprovadas, type NoticiaAprovadaItem } from './noticias'
import {
  escopoFeedComGrupos,
  escopoFeedSemConversa,
  escopoFeedSomenteGrupos,
  filtroMembroGrupoAtivo,
} from './grupos-scope'

export {
  escopoFeedComGrupos,
  escopoFeedSomenteGrupos,
  filtroMembroGrupoAtivo,
  filtroMembroGrupoNoFeed,
} from './grupos-scope'

export interface FeedOpts {
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
  autor: { id: string; nome: string | null; nickname: string | null; avatarUrl: string | null }
  midiaUrls: string[]
  oculto: boolean
}

export interface ComunicadoOrigemEmbed {
  id: string
  titulo: string
  corpo: string
  prioridade: 'NORMAL' | 'IMPORTANTE' | 'URGENTE'
  tenantId: string
  tenantNome: string
  autorId: string | null
  autorNome: string | null
  autorCargoNome: string | null
  autorDepartamentoNome: string | null
}

export interface EventoPostEmbed {
  id: string
  titulo: string
  data: Date
  local: string | null
  meuRsvp: 'CONFIRMADO' | 'RECUSADO' | null
}

/** Tenant no card do feed — nome + logo (comunicados oficiais usam no header). */
export type PostTenantLite = { nome: string; logoUrl: string | null }

const tenantSelectPost = {
  nome: true,
  logoUrl: true,
  torcidaConhecida: { select: { logoUrl: true } },
} as const

type TenantPostRaw = {
  nome: string
  logoUrl: string | null
  torcidaConhecida: { logoUrl: string | null } | null
}

function projetarTenantPost(tenant: TenantPostRaw): PostTenantLite {
  return {
    nome: formatNomeTorcida(tenant.nome),
    logoUrl: durableImageUrl(tenant.torcidaConhecida?.logoUrl ?? tenant.logoUrl),
  }
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
  tenant: PostTenantLite
  autor: {
    id: string
    nome: string | null
    nickname: string | null
    avatarUrl: string | null
    sedeNome: string | null
    cargoNome: string | null
    departamentoNome: string | null
  }
  totalReacoes: number
  totalComentarios: number
  minhaReacao: TipoReacaoSocial | null
  postOrigem: PostOrigemEmbed | null
  comunicadoOrigem: ComunicadoOrigemEmbed | null
  evento: EventoPostEmbed | null
  enquete: EnquetePostItem | null
  /** Origem do mural de grupo da comunidade, se houver. */
  grupo: { id: string; nome: string | null } | null
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
  | 'grupo'
  | 'tenant'
> & {
  tenant: TenantPostRaw
  _count: { reacoes: number; comentarios: number }
  reacoes: { tipo: string }[]
  conversa?: { id: string; nome: string | null; tipo: string } | null
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
    tenantId: string
    tenant: { nome: string }
    autor: { id: string; nome: string | null } | null
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
  const {
    _count,
    reacoes,
    postOrigem,
    comunicadoOrigem,
    evento,
    enquete,
    autor,
    tenant,
    conversa,
    ...rest
  } = post
  return {
    ...rest,
    imagemUrl: durableImageUrl(rest.imagemUrl),
    midiaUrls: filterDurableImageUrls(rest.midiaUrls),
    tenant: projetarTenantPost(tenant),
    autor: {
      id: autor?.id ?? rest.autorId,
      nome: autor?.nome ?? null,
      nickname: autor?.nickname ?? null,
      avatarUrl: durableImageUrl(autor?.avatarUrl ?? null),
      sedeNome: null,
      cargoNome: null,
      departamentoNome: null,
    },
    totalReacoes: _count.reacoes,
    totalComentarios: _count.comentarios,
    minhaReacao: reacoes[0] ? 'CURTIR' : null,
    postOrigem: postOrigem
      ? {
          id: postOrigem.id,
          conteudo: postOrigem.conteudo,
          oculto: postOrigem.oculto,
          midiaUrls: filterDurableImageUrls(postOrigem.midiaUrls),
          autor: {
            id: postOrigem.autor?.id ?? '',
            nome: postOrigem.autor?.nome ?? null,
            nickname: postOrigem.autor?.nickname ?? null,
            avatarUrl: durableImageUrl(postOrigem.autor?.avatarUrl ?? null),
          },
        }
      : null,
    comunicadoOrigem: comunicadoOrigem
      ? {
          id: comunicadoOrigem.id,
          titulo: comunicadoOrigem.titulo,
          corpo: comunicadoOrigem.corpo,
          prioridade: comunicadoOrigem.prioridade,
          tenantId: comunicadoOrigem.tenantId,
          tenantNome: formatNomeTorcida(comunicadoOrigem.tenant.nome),
          autorId: comunicadoOrigem.autor?.id ?? null,
          autorNome: comunicadoOrigem.autor?.nome ?? null,
          autorCargoNome: null,
          autorDepartamentoNome: null,
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
    grupo: conversa?.tipo === 'GRUPO' ? { id: conversa.id, nome: conversa.nome } : null,
  }
}

/** Include mínimo para cards de busca (sem engajamento/embeds). */
export function postIncludeBusca() {
  return {
    tenant: { select: tenantSelectPost },
    autor: { select: { id: true, nome: true, nickname: true, avatarUrl: true } },
  } as const
}

type PostBuscaRaw = {
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
  tenant: TenantPostRaw
  autor: { id: string; nome: string | null; nickname: string | null; avatarUrl: string | null }
}

/** Projeta post de busca sem carregar reações/enquete/repost. */
export function projetarPostBusca(post: PostBuscaRaw): PostSocialItem {
  return {
    id: post.id,
    tenantId: post.tenantId,
    titulo: post.titulo,
    conteudo: post.conteudo,
    imagemUrl: durableImageUrl(post.imagemUrl),
    midiaUrls: filterDurableImageUrls(post.midiaUrls),
    tipo: post.tipo,
    visibilidade: post.visibilidade,
    fixado: post.fixado,
    criadoEm: post.criadoEm,
    autorId: post.autorId,
    postOrigemId: post.postOrigemId,
    comunicadoOrigemId: post.comunicadoOrigemId,
    eventoId: post.eventoId,
    tenant: projetarTenantPost(post.tenant),
    autor: {
      ...post.autor,
      avatarUrl: durableImageUrl(post.autor.avatarUrl),
      sedeNome: null,
      cargoNome: null,
      departamentoNome: null,
    },
    totalReacoes: 0,
    totalComentarios: 0,
    minhaReacao: null,
    postOrigem: null,
    comunicadoOrigem: null,
    evento: null,
    enquete: null,
    grupo: null,
  }
}

/**
 * Include enxuto para listagem do feed — sem evento/RSVP (card carrega sob demanda).
 */
export function postIncludeLista(userId?: string) {
  return {
    tenant: { select: tenantSelectPost },
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
        tenantId: true,
        tenant: { select: { nome: true } },
        autor: { select: { id: true, nome: true } },
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

/**
 * OR do feed nacional — Prisma rejeita `in: []`; omitir o ramo de seguidos vazio.
 * Exportado para `comunidade-busca.ts` reaplicar o mesmo gate na busca de posts da CN.
 */
export function orFeedNacionalDescobrir(seguindoAprovados: string[]): Prisma.PostWhereInput[] {
  return compactOr([
    { tenant: { sintetico: true } },
    seguindoAprovados.length > 0 ? { autorId: { in: seguindoAprovados } } : null,
    { alcanceNacional: true },
  ])
}

export function postInclude(userId?: string) {
  return {
    tenant: { select: tenantSelectPost },
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
        tenantId: true,
        tenant: { select: { nome: true } },
        autor: { select: { id: true, nome: true } },
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

/**
 * Include enxuto para mural de grupo — sem comunicado/evento (raros no mural).
 * Mantém engajamento, enquete e repost.
 */
export function postIncludeGrupo(userId?: string) {
  return {
    tenant: { select: tenantSelectPost },
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

export function decodeCursor(cursor?: string): FeedCursor | null {
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

export function encodeCursor(post: { id: string; criadoEm: Date | string }): string {
  const criadoEm = post.criadoEm instanceof Date ? post.criadoEm : new Date(post.criadoEm)
  return Buffer.from(
    JSON.stringify({
      id: post.id,
      criadoEmIso: criadoEm.toISOString(),
    }),
    'utf8',
  ).toString('base64url')
}

/**
 * Cursor do feed Nacional: um por balde (torcedores da CN × organizadas).
 * Os dois avançam em ritmos diferentes — um cursor único por recência
 * arrastaria o balde lento junto e furaria a cota.
 */
export interface CursorNacional {
  torcedor: FeedCursor | null
  torcida: FeedCursor | null
}

function ehFeedCursor(valor: unknown): valor is FeedCursor {
  if (!valor || typeof valor !== 'object') return false
  const c = valor as Partial<FeedCursor>
  return typeof c.id === 'string' && typeof c.criadoEmIso === 'string'
}

export function decodeCursorNacional(cursor?: string): CursorNacional {
  if (!cursor) return { torcedor: null, torcida: null }
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    // Cursor legado (formato único, emitido antes dos dois baldes): vale para
    // os dois lados — a página seguinte fica correta, sem repetir nem pular.
    if (ehFeedCursor(parsed)) return { torcedor: parsed, torcida: parsed }
    if (parsed && typeof parsed === 'object') {
      const c = parsed as Partial<Record<keyof CursorNacional, unknown>>
      return {
        torcedor: ehFeedCursor(c.torcedor) ? c.torcedor : null,
        torcida: ehFeedCursor(c.torcida) ? c.torcida : null,
      }
    }
    return { torcedor: null, torcida: null }
  } catch {
    return { torcedor: null, torcida: null }
  }
}

export function encodeCursorNacional(cursores: CursorNacional): string {
  return Buffer.from(JSON.stringify(cursores), 'utf8').toString('base64url')
}

function chaveCursorNacional(cursores: CursorNacional): string {
  const parte = (c: FeedCursor | null) => (c ? `${c.criadoEmIso}:${c.id}` : 'start')
  return `${parte(cursores.torcedor)}|${parte(cursores.torcida)}`
}

/** Item mais antigo consumido de um balde — vira o cursor dele. */
function ultimoCursor(posts: PostSocialItem[]): FeedCursor | null {
  const ultimo = posts[posts.length - 1]
  if (!ultimo) return null
  const criadoEm = asDate(ultimo.criadoEm)
  return { id: ultimo.id, criadoEmIso: criadoEm.toISOString() }
}

/**
 * Distribui os dois baldes ao longo da página em vez de empilhar um depois do
 * outro: cada passo emite do balde que está mais atrás da sua fatia. Com 10 e
 * 2 itens, os 2 caem espaçados no meio — não colados no fim.
 */
export function intercalarProporcional<T>(a: T[], b: T[]): T[] {
  const out: T[] = []
  let i = 0
  let j = 0

  while (i < a.length || j < b.length) {
    if (j >= b.length) {
      out.push(a[i++]!)
      continue
    }
    if (i >= a.length) {
      out.push(b[j++]!)
      continue
    }
    // Progresso relativo: quem consumiu proporcionalmente menos, emite.
    if (i / a.length <= j / b.length) out.push(a[i++]!)
    else out.push(b[j++]!)
  }

  return out
}

export function buildCursorWhere(cursor: FeedCursor | null) {
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
  const oficialBoost =
    post.tipo === 'INSTITUCIONAL' && post.comunicadoOrigemId ? 100_000 + (post.fixado ? 50 : 0) : 0
  return freshness + engagement + localBoost + mediaBoost + pollBoost + oficialBoost
}

function rankDescobrirPosts(posts: PostSocialItem[], tenantId: string): PostSocialItem[] {
  return [...posts].sort((a, b) => {
    const diff = scoreDescobrirPost(b, tenantId) - scoreDescobrirPost(a, tenantId)
    if (diff !== 0) return diff
    return sortPostsDesc(a, b)
  })
}

/**
 * Decide se um post do Descobrir deve passar pelo gate de privacidade do
 * autor (`getAutoresSemAcesso`). Comunicados oficiais (INSTITUCIONAL +
 * comunicadoOrigemId) e posts "Só torcida" (TENANT) não podem ser escondidos
 * pela privacidade do autor: sócios são privatizados na aprovação
 * (`privatizarPerfilAoAprovarSocio`), mas isso não deve esconder comunicados
 * da diretoria nem publicações de outros sócios visíveis só pela torcida.
 */
export function deveAplicarGatePrivacidadeAutorDescobrir(post: {
  tipo?: string
  comunicadoOrigemId?: string | null
  visibilidade?: string
}): boolean {
  if (post.tipo === 'INSTITUCIONAL' && post.comunicadoOrigemId) return false
  if (post.visibilidade === 'TENANT') return false
  return true
}

function revivePostSocialItem(post: PostSocialItem): PostSocialItem {
  return {
    ...post,
    criadoEm: asDate(post.criadoEm),
    evento: post.evento ? { ...post.evento, data: asDate(post.evento.data) } : null,
  }
}

/**
 * "Só torcida" (TENANT) tem casa **na aba Minha torcida** — e só do tenant
 * ativo, nunca de outro tenant da hierarquia. Quem abre a aba já é sócio
 * aprovado dele (`podeVerFeedSocios`), então o `where` não depende do viewer e
 * o cache do Descobrir continua compartilhável.
 *
 * Sem isto o composer oferecia uma opção que fazia o post sumir de todo feed:
 * `TENANT` só reaparecia em perfil, permalink e salvos.
 */
export function orFeedInternoDoTenant(tenantId: string): Prisma.PostWhereInput {
  return { tenantId, tipo: 'MEMBRO', visibilidade: 'TENANT' }
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
  // R5 — ancestrais entram só pelo comunicado oficial quando o canal está
  // restrito; na operação normal a lista é vazia e o `where` não muda.
  const somenteComunicado = await resolveTenantIdsSomenteComunicado(tenantId)
  const somenteComunicadoKey = [...somenteComunicado].sort().join(',')

  const cached = await unstable_cache(
    async () => {
      const cursorWhere = buildCursorWhere(cursor)
      const postsRaw = (await db.post.findMany({
        where: {
          oculto: false,
          ...escopoFeedSemConversa,
          ...cursorWhere,
          OR: compactOr([
            {
              tenantId: { in: visibleTenantIds },
              visibilidade: 'PUBLICO',
              OR: [
                { tipo: 'MEMBRO' },
                { tipo: 'INSTITUCIONAL', comunicadoOrigemId: { not: null } },
              ],
            },
            orFeedInternoDoTenant(tenantId),
            ...orSomenteComunicadoOficial(somenteComunicado),
          ]),
        },
        orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
        take: fetchLimit,
        include: postIncludeLista(),
      })) as PostRaw[]
      return postsRaw.map(projetarPost)
    },
    [
      'feed-descobrir-base',
      tenantId,
      visibleTenantIdsKey,
      somenteComunicadoKey,
      cursorKey,
      String(fetchLimit),
    ],
    { revalidate: 60, tags: [tagFeedDescobrir(tenantId), ISOLAMENTO_CACHE_TAG] },
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

/**
 * Tenants cujos posts aparecem no feed do viewer — inclui o tenant sintético
 * da Comunidade Nacional do clube. Usado também em reagir/comentar para o
 * engajamento cobrir o mesmo conjunto que a UI lista.
 */
/**
 * R5 — tenants de onde a unidade isolada aceita SÓ o comunicado oficial.
 *
 * O comunicado é um único `Post` INSTITUCIONAL no tenant de quem publicou (não
 * há fan-out por unidade — ver `criarComunicado`). Como o canal restrito tira
 * o ancestral do conjunto do feed, sem esta exceção o comunicado da Sede
 * sumiria da praça — e ele é a ÚNICA publicação externa que a unidade isolada
 * deve enxergar.
 */
export async function resolveTenantIdsSomenteComunicado(
  tenantId: string,
): Promise<string[]> {
  if (!(await isTenantRestrito(tenantId))) return []
  return getAncestorTenantIds(tenantId)
}

/** `where` de post que libera exclusivamente o comunicado oficial. */
export function orSomenteComunicadoOficial(tenantIds: string[]): Prisma.PostWhereInput[] {
  if (tenantIds.length === 0) return []
  return [
    {
      tenantId: { in: tenantIds },
      tipo: 'INSTITUCIONAL',
      comunicadoOrigemId: { not: null },
      visibilidade: 'PUBLICO',
      oculto: false,
    },
  ]
}

export async function resolveVisibleTenantIdsForFeed(
  tenantId: string,
  userId: string | undefined,
): Promise<string[]> {
  const base = await getVisibleTenantIds(tenantId, 'comunidade')

  // R5 — canal restrito: a unidade isolada não recebe nem a Comunidade
  // Nacional, nem as coirmãs, nem o feed da Sede. O comunicado oficial do
  // ancestral entra por fora, via `resolveTenantIdsSomenteComunicado`.
  if (await isTenantRestrito(tenantId)) return base

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
  // R5 — coirmã com canal restrito não entra no feed de ninguém.
  const siblingsAbertas = await filtrarTenantsRestritos(siblings.map((s) => s.id))
  return [...new Set([...comSintetico, ...siblingsAbertas])]
}

/**
 * Tenants do feed **"Minha torcida"**: a própria torcida e a sua hierarquia
 * (Sede→Subsede→PDE). Fora, deliberadamente:
 *
 * - o **tenant sintético da Comunidade Nacional** — post de torcedor global
 *   vive só na CN. Ele já vazou para cá uma vez como "sugestão" e a aba virou
 *   uma segunda CN;
 * - as **torcidas aliadas** — Minha torcida é a minha organização, não a praça.
 *
 * R5 — canal restrito: a unidade isolada não enxerga o ancestral (o comunicado
 * oficial entra por fora, via `resolveTenantIdsSomenteComunicado`), e nenhuma
 * unidade restrita entra no conjunto de outra.
 *
 * Invariante coberto por `lib/__tests__/feed-minha-torcida.test.ts`.
 */
export const resolveTenantIdsMinhaTorcida = cache(
  async (tenantId: string): Promise<string[]> => {
    const [ancestrais, descendentes, restrito] = await Promise.all([
      getAncestorTenantIds(tenantId),
      getDescendantTenantIds(tenantId),
      isTenantRestrito(tenantId),
    ])

    const ids = new Set([tenantId, ...(restrito ? [] : ancestrais), ...descendentes])
    return filtrarTenantsRestritos(Array.from(ids), tenantId)
  },
)

export const getPostsParaFeed = cache(async function getPostsParaFeed(
  tenantId: string,
  userId: string | undefined,
  opts: FeedOpts = {},
): Promise<
  Pick<FeedPersonalizadoResult, 'postsSeguindo' | 'postsSugeridos' | 'pageInfo'> & {
    /** Página Descobrir já misturada na ordem do ranking. */
    posts: PostSocialItem[]
  }
> {
  const take = Math.min(Math.max(opts.take ?? 20, 5), 50)
  const decodedCursor = decodeCursor(opts.cursor)
  const cursorWhere = buildCursorWhere(decodedCursor)

  const [visibleTenantIds, seguindo]: [string[], SeguimentoLite[]] = await Promise.all([
    resolveTenantIdsMinhaTorcida(tenantId),
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
    // Sem viewer não há sócio: o balde interno do cache não pode vazar aqui.
    const publicos = sugeridos.filter((p) => p.visibilidade === 'PUBLICO')
    const candidatosGate = publicos.filter(deveAplicarGatePrivacidadeAutorDescobrir)
    const autorIds = candidatosGate.map((p) => p.autorId)
    const semAcesso = await getAutoresSemAcesso(undefined, tenantId, autorIds)
    const visiveis = publicos.filter(
      (p) => !deveAplicarGatePrivacidadeAutorDescobrir(p) || !semAcesso.has(p.autorId),
    )
    const ranqueados = rankDescobrirPosts(visiveis, tenantId)
    const slice = await finalizarPosts(ranqueados.slice(0, take))
    const hasMore = ranqueados.length > take
    return {
      posts: slice,
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
        // O `visibilidade` aqui não é redundante com o conjunto de tenants:
        // sem ele, um post "Só torcida" de OUTRO tenant, de alguém que o viewer
        // segue, entraria pela rede. Interno só do tenant ativo, onde o viewer
        // é sócio.
        OR: [{ visibilidade: 'PUBLICO' }, { tenantId, visibilidade: 'TENANT' }],
        oculto: false,
        ...escopoFeedSemConversa,
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

  const discoverExternos = discoverBase.filter(
    (p) => !redeSet.has(p.autorId) || (p.tipo === 'INSTITUCIONAL' && p.comunicadoOrigemId),
  )
  const candidatosGate = discoverExternos.filter(deveAplicarGatePrivacidadeAutorDescobrir)
  const autorIdsExternos = candidatosGate.map((p) => p.autorId)
  const semAcesso = await getAutoresSemAcesso(userId, tenantId, autorIdsExternos)
  const discoverVisiveis = discoverExternos.filter(
    (p) => !deveAplicarGatePrivacidadeAutorDescobrir(p) || !semAcesso.has(p.autorId),
  )

  // Ranking único: rede (inclui o autor) + externos — post fresco do viewer sobe no Descobrir.
  const candidatos = rankDescobrirPosts([...discoverVisiveis, ...seguindoOrdenados], tenantId)
  const hasMore = candidatos.length > take
  const paginaBruta = candidatos.slice(0, take)
  const pagina = await finalizarPosts(await hidratarPostsDoUsuario(paginaBruta, userId))
  const nextCursor = hasMore && pagina.length > 0 ? encodeCursor(pagina[pagina.length - 1]) : null

  return {
    posts: pagina,
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
            ...escopoFeedSemConversa,
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
      user: { select: { id: true, nome: true, avatarUrl: true } },
    },
  })

  const sugestoes: SugestaoAutorAside[] = []
  const candidatosDePerfil = perfisPublicos.slice(0, 4)
  if (candidatosDePerfil.length > 0) {
    // Filtra por privacidade efetiva (torcedor forçado público; sócio usa preferência gravada).
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
        avatarUrl: resolverAvatarSocial(p.user.avatarUrl),
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
 * Gate do feed de sócios: só SOCIO APROVADO no tenant libera posts TENANT.
 * TORCEDOR (mesmo APROVADO) e PENDENTE/REPROVADO ficam no feed público da
 * unidade — mural interno é privilégio de sócio (spec §3.1 + onboarding).
 * Super admin (oversight cross-tenant, sem SaasMembro) sempre passa.
 */
export const podeVerFeedSocios = cache(
  async (userId: string | undefined, tenantId: string): Promise<boolean> => {
    if (!userId) return false
    const membro: { status: string; tipo: string } | null = await db.saasMembro.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { status: true, tipo: true },
    })
    if (membro?.status === 'APROVADO' && membro.tipo === 'SOCIO') return true

    const user: { email: string | null } | null = await db.user.findUnique({
      where: { id: userId },
      select: { email: true },
    })
    return isSuperAdminEmail(user?.email)
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
    tipo?: string
    comunicadoOrigemId?: string | null
  },
): Promise<boolean> {
  if (post.oculto) return false
  if (viewerId === post.autorId) return true

  // Comunicados oficiais e posts "Só torcida" não dependem do perfil do autor.
  if (!deveAplicarGatePrivacidadeAutorDescobrir(post)) {
    if (post.visibilidade === 'TENANT') return podeVerFeedSocios(viewerId, post.tenantId)
    return true
  }

  if (!(await podeVerConteudoSocial(viewerId, post.autorId, post.tenantId))) return false
  if (post.visibilidade === 'PUBLICO') return true
  if (post.visibilidade === 'TENANT') {
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
  tipo?: string
  comunicadoOrigemId?: string | null
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
    if (!deveAplicarGatePrivacidadeAutorDescobrir(post)) continue
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

  const candidatos = posts.filter((p) => {
    if (p.oculto === true) return false
    if (!deveAplicarGatePrivacidadeAutorDescobrir(p)) return true
    return !bloqueados.has(`${p.tenantId}:${p.autorId}`)
  })
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
  const [visibleTenantIds, somenteComunicado] = await Promise.all([
    resolveVisibleTenantIdsForFeed(tenantId, viewerId),
    // R5 — o permalink precisa abrir o mesmo comunicado que o card do feed
    // mostra; sem isto o link do comunicado da Sede daria 404 na unidade
    // isolada, que é justamente a publicação externa que ela pode ver.
    resolveTenantIdsSomenteComunicado(tenantId),
  ])
  const raw: PostRaw | null = (await db.post.findFirst({
    where: {
      id: postId,
      oculto: false,
      OR: compactOr([
        { tenantId: { in: visibleTenantIds } },
        ...orSomenteComunicadoOficial(somenteComunicado),
      ]),
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
    tipo: post.tipo,
    comunicadoOrigemId: post.comunicadoOrigemId,
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

  // Mesma regra do Descobrir da aba: hierarquia da torcida, sem CN e sem
  // aliadas. "Seguindo" dentro de Minha torcida não pode ser uma porta lateral
  // para o que o Descobrir da aba não mostra.
  const visibleTenantIds = await resolveTenantIdsMinhaTorcida(tenantId)
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
        // A timeline materializada guarda o post, não a regra: o filtro de
        // visibilidade é reaplicado na leitura. Interno entra só do tenant
        // ativo — nunca "Só torcida" de outra torcida da hierarquia.
        OR: [{ visibilidade: 'PUBLICO' }, { tenantId, visibilidade: 'TENANT' }],
        oculto: false,
        ...escopoFeedSemConversa,
      },
      include: postInclude(userId),
    })) as PostRaw[]

    const byId = new Map(postsRaw.map((raw) => [raw.id, projetarPost(raw)]))
    const lote: PostSocialItem[] = []
    for (const row of timelineRows) {
      const post = byId.get(row.postId)
      if (!post || seen.has(post.id)) continue
      lote.push(post)
    }
    for (const post of lote) {
      if (seen.has(post.id)) continue
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
 * Feed "Seguindo" da Comunidade Nacional: só posts PUBLICO de quem o viewer
 * segue (APROVADO), dentro da mesma afiliação — sem vitrine Descobrir nem
 * alcanceNacional de não-seguidos.
 */
export const getPostsFeedNacionalSeguindo = cache(async function getPostsFeedNacionalSeguindo(
  afiliacaoId: string,
  userId: string,
  opts: FeedOpts = {},
): Promise<{ posts: PostSocialItem[]; pageInfo: FeedPersonalizadoResult['pageInfo'] }> {
  const take = Math.min(Math.max(opts.take ?? 20, 5), 50)
  const decodedCursor = decodeCursor(opts.cursor)
  const cursorWhere = buildCursorWhere(decodedCursor)

  const [tenantIds, seguindoAprovados] = await Promise.all([
    getTenantIdsPorAfiliacao(afiliacaoId),
    db.seguimento
      .findMany({
        where: { seguidorId: userId, status: 'APROVADO' },
        select: { seguidoId: true },
      })
      .then((rows: SeguimentoLite[]) => rows.map((s) => s.seguidoId)),
  ])

  if (tenantIds.length === 0 || seguindoAprovados.length === 0) {
    return { posts: [], pageInfo: { hasMore: false, nextCursor: null } }
  }

  const postsRaw = (await db.post.findMany({
    where: {
      tenantId: { in: tenantIds },
      tipo: 'MEMBRO',
      visibilidade: 'PUBLICO',
      oculto: false,
      ...escopoFeedSemConversa,
      ...cursorWhere,
      autorId: { in: seguindoAprovados },
    },
    orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
    take: take + 1,
    include: postIncludeLista(userId),
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

export const getPostsFeedNacionalGrupos = cache(async function getPostsFeedNacionalGrupos(
  afiliacaoId: string,
  userId: string,
  opts: FeedOpts = {},
): Promise<{ posts: PostSocialItem[]; pageInfo: FeedPersonalizadoResult['pageInfo'] }> {
  const take = Math.min(Math.max(opts.take ?? 20, 5), 50)
  const decodedCursor = decodeCursor(opts.cursor)
  const cursorWhere = buildCursorWhere(decodedCursor)

  const sintetico: { id: string } | null = await db.tenant.findFirst({
    where: { afiliacaoId, sintetico: true, ativo: true },
    select: { id: true },
  })
  if (!sintetico) {
    return { posts: [], pageInfo: { hasMore: false, nextCursor: null } }
  }

  const postsRaw = (await db.post.findMany({
    where: {
      tenantId: sintetico.id,
      tipo: 'MEMBRO',
      oculto: false,
      ...escopoFeedSomenteGrupos(userId),
      ...cursorWhere,
    },
    orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
    take: take + 1,
    include: postIncludeGrupo(userId),
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

/**
 * Feed da comunidade nacional (Descobrir): posts de torcedores (tenant sintético
 * do clube, sempre abertos) + posts de sócios só de quem o torcedor segue e
 * está APROVADO + posts com alcanceNacional explícito.
 */
export const getPostsFeedNacional = cache(async function getPostsFeedNacional(
  afiliacaoId: string,
  userId: string | undefined,
  opts: FeedOpts = {},
): Promise<{ posts: PostSocialItem[]; pageInfo: FeedPersonalizadoResult['pageInfo'] }> {
  const take = Math.min(Math.max(opts.take ?? 20, 5), 50)
  const cursores = decodeCursorNacional(opts.cursor)
  const cursorTorcedorWhere = buildCursorWhere(cursores.torcedor)
  const cursorTorcidaWhere = buildCursorWhere(cursores.torcida)
  const cursorKey = chaveCursorNacional(cursores)

  const [tenantIds, seguindoAprovados, sintetico] = await Promise.all([
    getTenantIdsPorAfiliacao(afiliacaoId),
    userId
      ? db.seguimento
          .findMany({
            where: { seguidorId: userId, status: 'APROVADO' },
            select: { seguidoId: true },
          })
          .then((rows: SeguimentoLite[]) => rows.map((s) => s.seguidoId))
      : Promise.resolve([] as string[]),
    db.tenant.findFirst({
      where: { afiliacaoId, sintetico: true },
      select: { id: true },
    }),
  ])

  if (tenantIds.length === 0) {
    return { posts: [], pageInfo: { hasMore: false, nextCursor: null } }
  }

  const seguindoKey = [...seguindoAprovados].sort().join(',') || 'none'
  const tenantIdsKey = [...tenantIds].sort().join(',')
  const idsTorcidas = sintetico ? tenantIds.filter((id) => id !== sintetico.id) : tenantIds

  // Dois baldes, uma consulta cada. Uma consulta só, ordenada por recência,
  // devolvia a página inteira do balde mais prolífico (organizadas com
  // `alcanceNacional`) e o torcedor sumia da CN.
  const [postsTorcedorRaw, postsTorcidaRaw] = await Promise.all([
    sintetico
      ? (unstable_cache(
          async () =>
            db.post.findMany({
              where: {
                tenantId: sintetico.id,
                tipo: 'MEMBRO',
                visibilidade: 'PUBLICO',
                oculto: false,
                ...escopoFeedSemConversa,
                ...cursorTorcedorWhere,
              },
              orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
              take: take + 1,
              include: postIncludeLista(userId),
            }) as Promise<PostRaw[]>,
          [
            'feed-nacional-torcedor',
            afiliacaoId,
            userId ?? 'anon',
            sintetico.id,
            cursorKey,
            String(take),
          ],
          { revalidate: 45, tags: [tagFeedNacional(afiliacaoId)] },
        )() as Promise<PostRaw[]>)
      : Promise.resolve([] as PostRaw[]),
    idsTorcidas.length > 0
      ? (unstable_cache(
          async () =>
            db.post.findMany({
              where: {
                tenantId: { in: idsTorcidas },
                tipo: 'MEMBRO',
                visibilidade: 'PUBLICO',
                oculto: false,
                ...escopoFeedSemConversa,
                ...cursorTorcidaWhere,
                OR: orFeedNacionalDescobrir(seguindoAprovados),
              },
              orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
              take: take + 1,
              include: postIncludeLista(userId),
            }) as Promise<PostRaw[]>,
          [
            'feed-nacional-torcidas',
            afiliacaoId,
            userId ?? 'anon',
            seguindoKey,
            tenantIdsKey,
            cursorKey,
            String(take),
          ],
          { revalidate: 45, tags: [tagFeedNacional(afiliacaoId)] },
        )() as Promise<PostRaw[]>)
      : Promise.resolve([] as PostRaw[]),
  ])

  const torcedorRecencia = postsTorcedorRaw.map(projetarPost)
  const torcidaRecencia = postsTorcidaRaw.map(projetarPost)

  // Quantos de cada balde entram nesta página. A CN é a praça do torcedor:
  // metade é dele por direito, e o que ele não ocupar volta para as torcidas
  // (e vice-versa) — cota nunca vira página curta.
  const cota = Math.ceil(take / 2)
  let nTorcedor = Math.min(cota, torcedorRecencia.length)
  const nTorcida = Math.min(take - nTorcedor, torcidaRecencia.length)
  if (nTorcedor + nTorcida < take) {
    nTorcedor = Math.min(torcedorRecencia.length, take - nTorcida)
  }

  // O corte é sempre no PREFIXO por recência: o cursor de cada balde é o item
  // mais antigo consumido dele. Reordenar antes de cortar (como o ranking
  // fazia) pulava posts na página seguinte.
  const consumidoTorcedor = torcedorRecencia.slice(0, nTorcedor)
  const consumidoTorcida = torcidaRecencia.slice(0, nTorcida)

  const escopoRanking = sintetico?.id ?? tenantIds[0] ?? afiliacaoId
  const paginaBruta = intercalarProporcional(
    rankDescobrirPosts(consumidoTorcedor, escopoRanking),
    rankDescobrirPosts(consumidoTorcida, escopoRanking),
  )

  const hasMore =
    torcedorRecencia.length > nTorcedor || torcidaRecencia.length > nTorcida
  const pagina = await finalizarPosts(paginaBruta)

  return {
    posts: pagina,
    pageInfo: {
      hasMore,
      nextCursor: hasMore
        ? encodeCursorNacional({
            torcedor: ultimoCursor(consumidoTorcedor) ?? cursores.torcedor,
            torcida: ultimoCursor(consumidoTorcida) ?? cursores.torcida,
          })
        : null,
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
      ...escopoFeedSemConversa,
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
      ...escopoFeedSemConversa,
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

/**
 * Posts MEMBRO públicos com vídeo nativo (Cloudinary `/video/upload/` ou
 * extensão .mp4/.webm/.mov/.m4v). Embeds (YouTube/TikTok) ficam no feed,
 * não nesta galeria — o player de Reels só toca `<video>`.
 */
export async function getPostsComVideo(
  tenantId: string,
  userId?: string,
): Promise<PostSocialItem[]> {
  const { isVideoUrl } = await import('./comunidade-social')
  const visibleTenantIds = await getVisibleTenantIds(tenantId, 'comunidade')
  if (visibleTenantIds.length === 0) return []

  const videoExt = '\\.(mp4|webm|mov|m4v)(\\?|$)'
  const videoMatch = Prisma.sql`(
    (p.imagem_url IS NOT NULL AND (
      p.imagem_url LIKE ${'%/video/upload/%'}
      OR p.imagem_url ~* ${videoExt}
    ))
    OR EXISTS (
      SELECT 1 FROM unnest(p.midia_urls) AS u
      WHERE u LIKE ${'%/video/upload/%'}
         OR u ~* ${videoExt}
    )
  )`

  const grupoScope = userId
    ? Prisma.sql`(
        p.conversa_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM saas_conversas c
          INNER JOIN saas_membros_conversa m ON m.conversa_id = c.id
          WHERE c.id = p.conversa_id
            AND c.tipo = 'GRUPO'
            AND c.comunidade = true
            AND m.user_id = ${userId}
            AND m.status = 'ATIVO'
            AND m.saiu_em IS NULL
            AND m.silenciada = false
        )
      )`
    : Prisma.sql`p.conversa_id IS NULL`

  const idRows: Array<{ id: string }> = await db.$queryRaw`
    SELECT p.id
    FROM saas_posts p
    WHERE p.tenant_id IN (${Prisma.join(visibleTenantIds)})
      AND p.tipo = 'MEMBRO'
      AND p.oculto = false
      AND p.visibilidade = 'PUBLICO'
      AND ${videoMatch}
      AND ${grupoScope}
    ORDER BY p.criado_em DESC
    LIMIT 30
  `

  const ids = idRows.map((row) => row.id)
  if (ids.length === 0) return []

  const postsRaw = (await db.post.findMany({
    where: { id: { in: ids } },
    include: postInclude(userId),
  })) as PostRaw[]

  const byId = new Map(postsRaw.map((p) => [p.id, p]))
  let posts = ids
    .map((id) => byId.get(id))
    .filter((p): p is PostRaw => p != null)
    .map(projetarPost)
    .filter(
      (p) =>
        p.midiaUrls.some(isVideoUrl) ||
        (p.imagemUrl != null && isVideoUrl(p.imagemUrl)),
    )

  if (userId) {
    const autorIds = posts.map((p) => p.autorId)
    const semAcesso = await getAutoresSemAcesso(userId, tenantId, autorIds)
    posts = posts.filter((p) => !semAcesso.has(p.autorId))
  }

  return finalizarPosts(posts)
}

/** Contagem só de membros ativos. */
const membrosAtivosCount = {
  where: { status: 'ATIVO' as const, saiuEm: null },
} as const

export interface GrupoItem {
  id: string
  nome: string | null
  descricao: string | null
  avatarUrl: string | null
  membros: number
  publica: boolean
  souMembro: boolean
  pedidoPendente: boolean
  souAdmin: boolean
  silenciada: boolean
  codigoConvite: string | null
  somenteAdminPublica: boolean
}

/** @deprecated Use GrupoItem */
export type GrupoPublicoItem = GrupoItem
export type GrupoDetalheItem = GrupoItem

export interface MembroGrupoItem {
  userId: string
  nome: string | null
  nickname: string | null
  avatarUrl: string | null
  papel: 'ADMIN' | 'MEMBRO'
  entrouEm: Date
}

export interface MembroGrupoPendenteItem {
  userId: string
  nome: string | null
  avatarUrl: string | null
  pediuEm: Date
}

/** Posts recentes dos murais dos grupos do viewer (merge no Descobrir). */
async function getPostsRecentesDosMeusGrupos(
  tenantId: string,
  userId: string,
  take: number,
): Promise<PostSocialItem[]> {
  const visibleTenantIds = await getVisibleTenantIds(tenantId, 'comunidade')
  const postsRaw = (await db.post.findMany({
    where: {
      tenantId: { in: visibleTenantIds },
      tipo: 'MEMBRO',
      oculto: false,
      ...escopoFeedSomenteGrupos(userId),
    },
    orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
    take,
    include: postInclude(userId),
  })) as PostRaw[]
  return postsRaw.map(projetarPost)
}

export async function getGruposDoTenant(
  tenantId: string,
  userId?: string,
): Promise<GrupoItem[]> {
  const rows: Array<{
    id: string
    nome: string | null
    descricao: string | null
    avatarUrl: string | null
    publica: boolean
    somenteAdminPublica: boolean
    _count: { membros: number }
    membros: Array<{
      id: string
      papel: 'ADMIN' | 'MEMBRO'
      status: 'ATIVO' | 'PENDENTE' | 'REJEITADO'
      silenciada: boolean
    }>
  }> = await db.conversa.findMany({
    where: { tenantId, tipo: 'GRUPO', comunidade: true },
    orderBy: { atualizadoEm: 'desc' },
    take: 50,
    select: {
      id: true,
      nome: true,
      descricao: true,
      avatarUrl: true,
      publica: true,
      somenteAdminPublica: true,
      _count: { select: { membros: membrosAtivosCount } },
      membros: userId
        ? {
            where: { userId, saiuEm: null },
            select: { id: true, papel: true, status: true, silenciada: true },
            take: 1,
          }
        : { where: { id: '' }, select: { id: true, papel: true, status: true, silenciada: true }, take: 0 },
    },
  })

  return rows.map((g) => {
    const membro = g.membros[0]
    return {
      id: g.id,
      nome: g.nome,
      descricao: g.descricao,
      avatarUrl: durableImageUrl(g.avatarUrl),
      publica: g.publica,
      membros: g._count.membros,
      souMembro: membro?.status === 'ATIVO',
      pedidoPendente: membro?.status === 'PENDENTE',
      souAdmin: membro?.status === 'ATIVO' && membro.papel === 'ADMIN',
      silenciada: membro?.silenciada ?? false,
      codigoConvite: null,
      somenteAdminPublica: g.somenteAdminPublica,
    }
  })
}

/** @deprecated Use getGruposDoTenant */
export async function getGruposPublicos(
  tenantId: string,
  userId?: string,
): Promise<GrupoItem[]> {
  return getGruposDoTenant(tenantId, userId)
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
    avatarUrl: string | null
    codigoConvite: string | null
    publica: boolean
    somenteAdminPublica: boolean
    comunidade: boolean
    _count: { membros: number }
    membros: Array<{
      papel: 'ADMIN' | 'MEMBRO'
      status: 'ATIVO' | 'PENDENTE' | 'REJEITADO'
      silenciada: boolean
    }>
  } | null = await db.conversa.findFirst({
    where: { id: conversaId, tenantId, tipo: 'GRUPO', comunidade: true },
    select: {
      id: true,
      nome: true,
      descricao: true,
      avatarUrl: true,
      codigoConvite: true,
      publica: true,
      somenteAdminPublica: true,
      comunidade: true,
      _count: { select: { membros: membrosAtivosCount } },
      membros: {
        where: { userId, saiuEm: null },
        select: { papel: true, status: true, silenciada: true },
        take: 1,
      },
    },
  })
  if (!row) return null

  const membro = row.membros[0]
  const souAdmin = membro?.status === 'ATIVO' && membro.papel === 'ADMIN'
  return {
    id: row.id,
    nome: row.nome,
    descricao: row.descricao,
    avatarUrl: durableImageUrl(row.avatarUrl),
    membros: row._count.membros,
    publica: row.publica,
    souMembro: membro?.status === 'ATIVO',
    pedidoPendente: membro?.status === 'PENDENTE',
    souAdmin,
    silenciada: membro?.silenciada ?? false,
    codigoConvite: souAdmin ? row.codigoConvite : null,
    somenteAdminPublica: row.somenteAdminPublica,
  }
}

export async function getMembrosGrupo(
  conversaId: string,
  tenantId: string,
  viewerId: string,
): Promise<MembroGrupoItem[]> {
  const viewer: { id: string } | null = await db.membroConversa.findFirst({
    where: { conversaId, ...filtroMembroGrupoAtivo(viewerId) },
    select: { id: true },
  })
  if (!viewer) return []

  const grupo: { id: string } | null = await db.conversa.findFirst({
    where: { id: conversaId, tenantId, tipo: 'GRUPO', comunidade: true },
    select: { id: true },
  })
  if (!grupo) return []

  const rows: Array<{
    userId: string
    papel: 'ADMIN' | 'MEMBRO'
    entrouEm: Date
    user: {
      nome: string | null
      nickname: string | null
      avatarUrl: string | null
    }
  }> = await db.membroConversa.findMany({
    where: { conversaId, status: 'ATIVO', saiuEm: null },
    orderBy: [{ papel: 'asc' }, { entrouEm: 'asc' }],
    take: 200,
    select: {
      userId: true,
      papel: true,
      entrouEm: true,
      user: { select: { nome: true, nickname: true, avatarUrl: true } },
    },
  })

  return rows.map((r) => ({
    userId: r.userId,
    nome: r.user.nome,
    nickname: r.user.nickname,
    avatarUrl: durableImageUrl(r.user.avatarUrl),
    papel: r.papel,
    entrouEm: r.entrouEm,
  }))
}

export async function getPedidosPendentesGrupo(
  conversaId: string,
  tenantId: string,
  adminUserId: string,
): Promise<MembroGrupoPendenteItem[]> {
  const admin: { id: string } | null = await db.membroConversa.findFirst({
    where: {
      conversaId,
      userId: adminUserId,
      papel: 'ADMIN',
      status: 'ATIVO',
      saiuEm: null,
    },
    select: { id: true },
  })
  if (!admin) return []

  const grupo: { id: string } | null = await db.conversa.findFirst({
    where: { id: conversaId, tenantId, tipo: 'GRUPO', comunidade: true },
    select: { id: true },
  })
  if (!grupo) return []

  const rows: Array<{
    userId: string
    entrouEm: Date
    user: { nome: string | null; avatarUrl: string | null }
  }> = await db.membroConversa.findMany({
    where: { conversaId, status: 'PENDENTE', saiuEm: null },
    orderBy: { entrouEm: 'asc' },
    take: 50,
    select: {
      userId: true,
      entrouEm: true,
      user: { select: { nome: true, avatarUrl: true } },
    },
  })

  return rows.map((r) => ({
    userId: r.userId,
    nome: r.user.nome,
    avatarUrl: durableImageUrl(r.user.avatarUrl),
    pediuEm: r.entrouEm,
  }))
}

export const getPostsDoGrupo = cache(async function getPostsDoGrupo(
  conversaId: string,
  tenantId: string,
  userId: string,
  opts: FeedOpts = {},
): Promise<{ posts: PostSocialItem[]; pageInfo: FeedPersonalizadoResult['pageInfo'] }> {
  const take = Math.min(Math.max(opts.take ?? 20, 5), 50)
  const decodedCursor = decodeCursor(opts.cursor)
  const cursorWhere = buildCursorWhere(decodedCursor)

  const membro: { id: string } | null = await db.membroConversa.findFirst({
    where: { conversaId, ...filtroMembroGrupoAtivo(userId) },
    select: { id: true },
  })
  if (!membro) {
    return { posts: [], pageInfo: { hasMore: false, nextCursor: null } }
  }

  const grupo: { id: string } | null = await db.conversa.findFirst({
    where: { id: conversaId, tenantId, tipo: 'GRUPO', comunidade: true },
    select: { id: true },
  })
  if (!grupo) {
    return { posts: [], pageInfo: { hasMore: false, nextCursor: null } }
  }

  const postsRaw = (await db.post.findMany({
    where: {
      conversaId,
      tenantId,
      oculto: false,
      ...cursorWhere,
    },
    orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
    take: take + 1,
    include: postIncludeGrupo(userId),
  })) as PostRaw[]

  const hasMore = postsRaw.length > take
  const pagina = await finalizarPosts(postsRaw.slice(0, take).map(projetarPost))

  return {
    posts: pagina,
    pageInfo: {
      hasMore,
      nextCursor: hasMore && pagina.length > 0 ? encodeCursor(pagina[pagina.length - 1]) : null,
    },
  }
})

/**
 * Feed só dos murais dos grupos do viewer (aba "Meus grupos").
 */
export const getPostsDosMeusGrupos = cache(async function getPostsDosMeusGrupos(
  tenantId: string,
  userId: string,
  opts: FeedOpts = {},
): Promise<{ posts: PostSocialItem[]; pageInfo: FeedPersonalizadoResult['pageInfo'] }> {
  const take = Math.min(Math.max(opts.take ?? 20, 5), 50)
  const decodedCursor = decodeCursor(opts.cursor)
  const cursorWhere = buildCursorWhere(decodedCursor)
  const visibleTenantIds = await getVisibleTenantIds(tenantId, 'comunidade')

  const postsRaw = (await db.post.findMany({
    where: {
      tenantId: { in: visibleTenantIds },
      tipo: 'MEMBRO',
      oculto: false,
      ...escopoFeedSomenteGrupos(userId),
      ...cursorWhere,
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

export async function getPostIdsSalvos(userId: string, tenantId: string): Promise<Set<string>> {
  const rows: Array<{ postId: string }> = await db.postSalvo.findMany({
    where: { userId, tenantId },
    select: { postId: true },
  })
  return new Set(rows.map((r) => r.postId))
}

/** Salvos só dos posts já carregados na página (evita set completo do tenant). */
export async function getPostIdsSalvosParaPosts(
  userId: string,
  tenantId: string,
  postIds: string[],
): Promise<Set<string>> {
  if (postIds.length === 0) return new Set()
  const rows: Array<{ postId: string }> = await db.postSalvo.findMany({
    where: { userId, tenantId, postId: { in: postIds } },
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
