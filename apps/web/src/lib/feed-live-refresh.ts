/** Debounce do refetch após ping SSE do feed (ms). */
export const FEED_SSE_DEBOUNCE_MS = 250

/** Considera "topo" para auto-refresh sem bagunçar a rolagem. */
export const FEED_NEAR_TOP_PX = 280

export function isComunidadeFeedNearTop(): boolean {
  if (typeof window === 'undefined') return true
  return window.scrollY < FEED_NEAR_TOP_PX
}
