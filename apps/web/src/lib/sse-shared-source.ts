/**
 * Um EventSource por endpoint — navbar + chat + feed banner não abrem N streams.
 *
 * No Railway/HTTP/2, cada EventSource extra disputa a conexão multiplexada;
 * RST em qualquer um vira ERR_HTTP2_PROTOCOL_ERROR e envenena soft-nav.
 */

import { SSE_RECONNECT_DATA } from '@/lib/sse-protocol'
import {
  isSsePausedForNav,
  registerSseCloser,
} from '@/lib/sse-nav-gate'

/** Um pouco após o `data: reconnect` do servidor (~18s). */
const PROACTIVE_RECONNECT_MS = 20_000
const BASE_ERROR_MS = 8_000
const MAX_ERROR_MS = 60_000
const CIRCUIT_OPEN_MS = 120_000
const CIRCUIT_THRESHOLD = 2

type PingListener = () => void

type SharedEntry = {
  endpoint: string
  listeners: Set<PingListener>
  source: EventSource | null
  generation: number
  consecutiveFailures: number
  proactiveTimer: ReturnType<typeof setTimeout> | undefined
  errorTimer: ReturnType<typeof setTimeout> | undefined
  unregisterCloser: (() => void) | undefined
}

const registry = new Map<string, SharedEntry>()

function backoffMs(failures: number): number {
  if (failures >= CIRCUIT_THRESHOLD) return CIRCUIT_OPEN_MS
  const exp = Math.max(0, failures - 1)
  return Math.min(BASE_ERROR_MS * 2 ** exp, MAX_ERROR_MS)
}

function clearTimers(entry: SharedEntry) {
  if (entry.proactiveTimer) clearTimeout(entry.proactiveTimer)
  if (entry.errorTimer) clearTimeout(entry.errorTimer)
  entry.proactiveTimer = undefined
  entry.errorTimer = undefined
}

function detach(es: EventSource | null) {
  if (!es) return
  es.onerror = null
  es.onmessage = null
  es.close()
}

function closeSource(entry: SharedEntry) {
  clearTimers(entry)
  entry.generation += 1
  detach(entry.source)
  entry.source = null
}

function openSource(entry: SharedEntry) {
  if (entry.listeners.size === 0 || isSsePausedForNav()) return
  clearTimers(entry)
  const id = ++entry.generation
  detach(entry.source)
  entry.source = null

  const next = new EventSource(entry.endpoint)
  entry.source = next

  next.onmessage = (event: MessageEvent<string>) => {
    if (id !== entry.generation) return
    entry.consecutiveFailures = 0
    if (event.data === SSE_RECONNECT_DATA) {
      openSource(entry)
      return
    }
    if (event.data === 'ping') {
      entry.listeners.forEach((l) => {
        try {
          l()
        } catch {
          /* listener isolado */
        }
      })
    }
  }

  next.onerror = () => {
    if (id !== entry.generation) return
    entry.consecutiveFailures += 1
    detach(next)
    if (entry.source === next) entry.source = null
    entry.errorTimer = setTimeout(() => openSource(entry), backoffMs(entry.consecutiveFailures))
  }

  entry.proactiveTimer = setTimeout(() => {
    if (id !== entry.generation) return
    openSource(entry)
  }, PROACTIVE_RECONNECT_MS)
}

function ensureEntry(endpoint: string): SharedEntry {
  let entry = registry.get(endpoint)
  if (entry) return entry
  entry = {
    endpoint,
    listeners: new Set(),
    source: null,
    generation: 0,
    consecutiveFailures: 0,
    proactiveTimer: undefined,
    errorTimer: undefined,
    unregisterCloser: undefined,
  }
  entry.unregisterCloser = registerSseCloser(() => closeSource(entry!))
  registry.set(endpoint, entry)
  return entry
}

/**
 * Assina pings SSE de `endpoint`. Vários assinantes compartilham um EventSource.
 * Unsubscribe fecha a conexão só quando não restar ninguém.
 */
export function subscribeSharedSse(endpoint: string, onPing: PingListener): () => void {
  if (!endpoint) return () => {}
  const entry = ensureEntry(endpoint)
  entry.listeners.add(onPing)
  if (!entry.source && !isSsePausedForNav()) {
    openSource(entry)
  }
  return () => {
    entry.listeners.delete(onPing)
    if (entry.listeners.size > 0) return
    closeSource(entry)
    entry.unregisterCloser?.()
    entry.unregisterCloser = undefined
    registry.delete(endpoint)
  }
}

/** Só para testes. */
export function resetSharedSseForTests(): void {
  for (const entry of registry.values()) {
    closeSource(entry)
    entry.unregisterCloser?.()
  }
  registry.clear()
}
