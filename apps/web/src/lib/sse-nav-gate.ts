/**
 * Pausa streams SSE antes de soft-nav do App Router.
 *
 * No Railway/HTTP/2, EventSource aberto disputa a conexão multiplexada com o
 * fetch do RSC. Um RST no stream vira ERR_HTTP2_PROTOCOL_ERROR e o payload da
 * página falha com TypeError: network error (error.tsx da comunidade).
 *
 * Fechamos os EventSources no pointerdown de links internos — antes do click
 * disparar a navegação — e reassumimos após um quiet period curto.
 */

const DEFAULT_PAUSE_MS = 2_000

let pausedUntil = 0
let endTimer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()
/** Closers síncronos dos EventSources ativos — React setState seria tarde demais. */
const activeClosers = new Set<() => void>()

let installCount = 0

function notify() {
  listeners.forEach((l) => l())
}

export function isSsePausedForNav(): boolean {
  return Date.now() < pausedUntil
}

export function subscribeSseNavGate(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Registra close imediato do EventSource (chamado no pause, fora do React commit). */
export function registerSseCloser(close: () => void): () => void {
  activeClosers.add(close)
  return () => {
    activeClosers.delete(close)
  }
}

/** Pausa SSE; estende se já houver pausa em andamento. Fecha streams na hora. */
export function pauseSseForSoftNav(ms = DEFAULT_PAUSE_MS): void {
  const until = Date.now() + ms
  if (until > pausedUntil) pausedUntil = until
  // Síncrono: libera o HTTP/2 antes do Next iniciar o fetch do RSC.
  activeClosers.forEach((close) => {
    try {
      close()
    } catch {
      /* ignore */
    }
  })
  notify()
  if (endTimer) clearTimeout(endTimer)
  endTimer = setTimeout(() => {
    endTimer = undefined
    if (Date.now() >= pausedUntil) notify()
  }, Math.max(0, pausedUntil - Date.now()) + 16)
}

/** Exposto para testes — decide se o anchor dispara soft-nav interna. */
export function isInternalSoftNavHref(
  href: string | null,
  currentOrigin: string,
  currentPathname: string,
  currentSearch: string,
  opts?: { target?: string; download?: boolean },
): boolean {
  if (opts?.target && opts.target !== '_self') return false
  if (opts?.download) return false
  if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
    return false
  }
  try {
    const url = new URL(href, currentOrigin)
    if (url.origin !== currentOrigin) return false
    if (url.pathname === currentPathname && url.search === currentSearch) return false
    return true
  } catch {
    return false
  }
}

function isInternalSoftNavAnchor(anchor: HTMLAnchorElement): boolean {
  return isInternalSoftNavHref(
    anchor.getAttribute('href'),
    window.location.origin,
    window.location.pathname,
    window.location.search,
    { target: anchor.target, download: anchor.hasAttribute('download') },
  )
}

function onNavigateIntent(event: Event) {
  const target = event.target
  if (!(target instanceof Element)) return
  const anchor = target.closest('a[href]')
  if (!(anchor instanceof HTMLAnchorElement)) return
  if (!isInternalSoftNavAnchor(anchor)) return
  pauseSseForSoftNav()
}

/**
 * Instala o listener global (refcount). Chamar no mount de cada consumidor SSE.
 */
export function ensureSseNavGateInstalled(): () => void {
  if (typeof document === 'undefined') return () => {}
  if (installCount === 0) {
    // pointerdown: mouse/touch antes do click do Next/Link.
    // click (capture): Enter no link focado também dispara click.
    document.addEventListener('pointerdown', onNavigateIntent, true)
    document.addEventListener('click', onNavigateIntent, true)
  }
  installCount += 1
  return () => {
    installCount = Math.max(0, installCount - 1)
    if (installCount === 0) {
      document.removeEventListener('pointerdown', onNavigateIntent, true)
      document.removeEventListener('click', onNavigateIntent, true)
    }
  }
}

/** Só para testes — zera pausa e closers. */
export function resetSseNavGateForTests(): void {
  pausedUntil = 0
  if (endTimer) clearTimeout(endTimer)
  endTimer = undefined
  activeClosers.clear()
  listeners.clear()
  installCount = 0
}
