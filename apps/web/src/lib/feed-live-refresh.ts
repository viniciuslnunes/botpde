import type { PostSocialItem } from './feed'

/** Debounce do refetch após ping SSE do feed (ms). */
export const FEED_SSE_DEBOUNCE_MS = 250

/** Considera "topo" para auto-refresh sem bagunçar a rolagem. */
export const FEED_NEAR_TOP_PX = 280

/** Composer → infinite feed: atualiza TanStack Query sem `router.refresh()`. */
export const COMUNIDADE_POST_PUBLICADO_EVENT = 'comunidade:post-publicado'

/** Banner / gesto → refetch do topo do feed ativo (sem `router.refresh()`). */
export const COMUNIDADE_FEED_REFRESH_TOPO_EVENT = 'comunidade:feed-refresh-topo'

/** Menu → infinite feed: remove do cache TanStack sem `router.refresh()`. */
export const COMUNIDADE_POST_EXCLUIDO_EVENT = 'comunidade:post-excluido'

/** Badges do autor no prepend otimista / confirmação pós-publicação. */
export interface PostPublicadoAutorPreview {
  id: string
  nome: string | null
  avatarUrl: string | null
  nickname?: string | null
  sedeNome?: string | null
  cargoNome?: string | null
  departamentoNome?: string | null
}

/** Payload serializável do post acabado de criar — prepend otimista no client. */
export interface PostPublicadoPreview {
  id: string
  tenantId: string
  conteudo: string
  midiaUrls: string[]
  visibilidade: 'PUBLICO' | 'TENANT' | 'PRIVADO'
  /** ISO string */
  criadoEm: string
  autor: PostPublicadoAutorPreview
  tenantNome: string
}

export type PostPublicadoEventDetail = {
  preview?: PostPublicadoPreview
  /** Substitui um prepend otimista (id temporário) pelo post real. */
  substituirId?: string
  /** Aba do feed que deve receber o prepend (default: descobrir). */
  filtroAlvo?: 'descobrir' | 'seguindo' | 'grupos' | 'canal'
  /** Rollback de prepend otimista após falha na publicação. */
  removerId?: string
}

export type PostExcluidoEventDetail = {
  postId: string
}

/** Endpoint SSE do feed — Nacional usa canal por afiliação. */
export function feedStreamEndpoint(opts?: {
  escopo?: 'nacional' | 'torcida'
  afiliacaoId?: string
}): string {
  if (opts?.escopo === 'nacional' && opts.afiliacaoId) {
    const q = new URLSearchParams({
      escopo: 'nacional',
      afiliacaoId: opts.afiliacaoId,
    })
    return `/api/comunidade/feed/stream?${q.toString()}`
  }
  return '/api/comunidade/feed/stream'
}

/** Preview imediato no client — antes da Server Action concluir. */
export function criarPreviewOtimista(opts: {
  id: string
  tenantId: string
  conteudo: string
  midiaUrls: string[]
  visibilidade: PostPublicadoPreview['visibilidade']
  autor: PostPublicadoAutorPreview
  tenantNome: string
}): PostPublicadoPreview {
  return {
    id: opts.id,
    tenantId: opts.tenantId,
    conteudo: opts.conteudo,
    midiaUrls: opts.midiaUrls,
    visibilidade: opts.visibilidade,
    criadoEm: new Date().toISOString(),
    autor: {
      id: opts.autor.id,
      nome: opts.autor.nome,
      avatarUrl: opts.autor.avatarUrl,
      nickname: opts.autor.nickname ?? null,
      sedeNome: opts.autor.sedeNome ?? null,
      cargoNome: opts.autor.cargoNome ?? null,
      departamentoNome: opts.autor.departamentoNome ?? null,
    },
    tenantNome: opts.tenantNome,
  }
}

/** Converte preview de publicação em item do feed (prepend otimista). */
export function previewParaPostSocial(preview: PostPublicadoPreview): PostSocialItem {
  return {
    id: preview.id,
    tenantId: preview.tenantId,
    titulo: null,
    conteudo: preview.conteudo,
    imagemUrl: preview.midiaUrls[0] ?? null,
    midiaUrls: preview.midiaUrls,
    tipo: 'MEMBRO',
    visibilidade: preview.visibilidade,
    fixado: false,
    criadoEm: new Date(preview.criadoEm),
    autorId: preview.autor.id,
    postOrigemId: null,
    comunicadoOrigemId: null,
    eventoId: null,
    tenant: { nome: preview.tenantNome, logoUrl: null },
    autor: {
      id: preview.autor.id,
      nome: preview.autor.nome,
      nickname: preview.autor.nickname ?? null,
      avatarUrl: preview.autor.avatarUrl,
      sedeNome: preview.autor.sedeNome ?? null,
      cargoNome: preview.autor.cargoNome ?? null,
      departamentoNome: preview.autor.departamentoNome ?? null,
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

/** Exibe o nome da torcida no card quando o post é público ou de outro tenant. */
export function deveExibirBadgeTorcidaNoFeed(args: {
  postTenantId: string
  viewerTenantId: string
  visibilidade: PostPublicadoPreview['visibilidade']
  escopoNacional?: boolean
}): boolean {
  if (args.escopoNacional) return true
  if (args.visibilidade === 'PUBLICO') return true
  return args.postTenantId !== args.viewerTenantId
}

export function novoIdOtimista(): string {
  return `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function isComunidadeFeedNearTop(): boolean {
  if (typeof window === 'undefined') return true
  return window.scrollY < FEED_NEAR_TOP_PX
}

/** Notifica o feed client para refetch do topo (banner / gesto). */
export function emitirFeedRefreshTopo(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(COMUNIDADE_FEED_REFRESH_TOPO_EVENT))
}

/** Notifica o feed client — preferir `preview` para UI imediata. */
export function emitirPostPublicado(detail?: PostPublicadoEventDetail): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(COMUNIDADE_POST_PUBLICADO_EVENT, { detail }))
}

/** Notifica o feed client para sumir o post na hora (soft-delete no server). */
export function emitirPostExcluido(detail: PostExcluidoEventDetail): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(COMUNIDADE_POST_EXCLUIDO_EVENT, { detail }))
}
