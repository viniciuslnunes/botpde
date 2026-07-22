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

/** Payload serializável do post acabado de criar — prepend otimista no client. */
export interface PostPublicadoPreview {
  id: string
  tenantId: string
  conteudo: string
  midiaUrls: string[]
  visibilidade: 'PUBLICO' | 'TENANT' | 'PRIVADO'
  /** ISO string */
  criadoEm: string
  autor: {
    id: string
    nome: string | null
    avatarUrl: string | null
  }
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

/** Preview imediato no client — antes da Server Action concluir. */
export function criarPreviewOtimista(opts: {
  id: string
  tenantId: string
  conteudo: string
  midiaUrls: string[]
  visibilidade: PostPublicadoPreview['visibilidade']
  autor: PostPublicadoPreview['autor']
  tenantNome: string
}): PostPublicadoPreview {
  return {
    id: opts.id,
    tenantId: opts.tenantId,
    conteudo: opts.conteudo,
    midiaUrls: opts.midiaUrls,
    visibilidade: opts.visibilidade,
    criadoEm: new Date().toISOString(),
    autor: opts.autor,
    tenantNome: opts.tenantNome,
  }
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
