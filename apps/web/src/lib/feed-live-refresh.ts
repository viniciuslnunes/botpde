/** Debounce do refetch após ping SSE do feed (ms). */
export const FEED_SSE_DEBOUNCE_MS = 250

/** Considera "topo" para auto-refresh sem bagunçar a rolagem. */
export const FEED_NEAR_TOP_PX = 280

/** Composer → infinite feed: atualiza TanStack Query sem `router.refresh()`. */
export const COMUNIDADE_POST_PUBLICADO_EVENT = 'comunidade:post-publicado'

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
}

export type PostExcluidoEventDetail = {
  postId: string
}

export function isComunidadeFeedNearTop(): boolean {
  if (typeof window === 'undefined') return true
  return window.scrollY < FEED_NEAR_TOP_PX
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
