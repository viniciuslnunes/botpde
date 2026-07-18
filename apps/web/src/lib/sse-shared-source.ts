/**
 * Uma assinatura SSE por endpoint — navbar + chat + feed banner não abrem N streams.
 *
 * Usa `fetch` + ReadableStream em vez de `EventSource`:
 * - abort no soft-nav / reconnect aparece como canceled (não ERR_HTTP2_PROTOCOL_ERROR)
 * - EventSource no Railway/HTTP/2 disputava a conexão multiplexada; RST envenenava soft-nav
 */

import {
  SSE_CLIENT_PROACTIVE_MS,
  SSE_RECONNECT_DATA,
} from '@/lib/sse-protocol'
import {
  isSsePausedForNav,
  registerSseCloser,
} from '@/lib/sse-nav-gate'

const BASE_ERROR_MS = 8_000
const MAX_ERROR_MS = 60_000
const CIRCUIT_OPEN_MS = 120_000
const CIRCUIT_THRESHOLD = 2

type PingListener = () => void

type SharedEntry = {
  endpoint: string
  listeners: Set<PingListener>
  abort: AbortController | null
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

function closeSource(entry: SharedEntry) {
  clearTimers(entry)
  entry.generation += 1
  entry.abort?.abort()
  entry.abort = null
}

/**
 * Extrai campos `data:` de frames SSE completos (separados por linha em branco).
 * Comentários (`:`) e `retry:` são ignorados.
 */
export function consumeSseDataFrames(
  buffer: string,
): { rest: string; payloads: string[] } {
  const payloads: string[] = []
  let rest = buffer
  for (;;) {
    const sep = rest.indexOf('\n\n')
    if (sep < 0) break
    const frame = rest.slice(0, sep)
    rest = rest.slice(sep + 2)
    const dataLines: string[] = []
    for (const rawLine of frame.split('\n')) {
      const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
      if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).replace(/^ /, ''))
      }
    }
    if (dataLines.length > 0) payloads.push(dataLines.join('\n'))
  }
  return { rest, payloads }
}

function notifyPing(entry: SharedEntry) {
  entry.listeners.forEach((l) => {
    try {
      l()
    } catch {
      /* listener isolado */
    }
  })
}

function scheduleReconnect(entry: SharedEntry, delay: number) {
  if (entry.listeners.size === 0 || isSsePausedForNav()) return
  clearTimers(entry)
  entry.errorTimer = setTimeout(() => openSource(entry), delay)
}

async function readSseStream(entry: SharedEntry, id: number, signal: AbortSignal) {
  const res = await fetch(entry.endpoint, {
    method: 'GET',
    headers: { Accept: 'text/event-stream' },
    credentials: 'same-origin',
    cache: 'no-store',
    signal,
  })

  if (!res.ok || !res.body) {
    throw new Error(`sse http ${res.status}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (id !== entry.generation) {
      try {
        await reader.cancel()
      } catch {
        /* ignore */
      }
      return
    }
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const { rest, payloads } = consumeSseDataFrames(buffer)
    buffer = rest

    for (const data of payloads) {
      if (id !== entry.generation) return
      entry.consecutiveFailures = 0
      if (data === SSE_RECONNECT_DATA) {
        openSource(entry)
        return
      }
      if (data === 'ping') notifyPing(entry)
    }
  }
}

function openSource(entry: SharedEntry) {
  if (entry.listeners.size === 0 || isSsePausedForNav()) return
  clearTimers(entry)
  const id = ++entry.generation
  entry.abort?.abort()
  const ac = new AbortController()
  entry.abort = ac

  entry.proactiveTimer = setTimeout(() => {
    if (id !== entry.generation) return
    openSource(entry)
  }, SSE_CLIENT_PROACTIVE_MS)

  void (async () => {
    try {
      await readSseStream(entry, id, ac.signal)
      if (id !== entry.generation) return
      // Stream acabou sem abort (bye do servidor) — reabre.
      entry.consecutiveFailures = 0
      scheduleReconnect(entry, 1_000)
    } catch {
      if (id !== entry.generation) return
      if (ac.signal.aborted) return
      entry.consecutiveFailures += 1
      entry.abort = null
      scheduleReconnect(entry, backoffMs(entry.consecutiveFailures))
    }
  })()
}

function ensureEntry(endpoint: string): SharedEntry {
  let entry = registry.get(endpoint)
  if (entry) return entry
  entry = {
    endpoint,
    listeners: new Set(),
    abort: null,
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
 * Assina pings SSE de `endpoint`. Vários assinantes compartilham um stream.
 * Unsubscribe fecha a conexão só quando não restar ninguém.
 */
export function subscribeSharedSse(endpoint: string, onPing: PingListener): () => void {
  if (!endpoint) return () => {}
  const entry = ensureEntry(endpoint)
  entry.listeners.add(onPing)
  if (!entry.abort && !isSsePausedForNav()) {
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
