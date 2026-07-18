/**
 * Helper para rotas SSE de ping (notificações, feed, mensagens).
 *
 * Railway/Fastly + HTTP/2:
 * - sem `Connection`/`Keep-Alive` (hop-by-hop → ERR_HTTP2_PROTOCOL_ERROR)
 * - sem `Content-Encoding` (valor inventado tipo `none` também quebra H2 no Chrome)
 * - `no-transform` pede ao proxy para não comprimir o stream
 * - heartbeat evita idle cut (Railway: 5 min sem bytes)
 * - enqueue após close também gera PROTOCOL_ERROR
 * - `data: reconnect` antes do teto de 15 min: o cliente troca a conexão limpo;
 *   comentário `: bye` o parser não entrega → proxy RST vira PROTOCOL_ERROR
 *
 * Não reconectar a cada ~20s: isso martelava H2 e enchía o console de
 * ERR_HTTP2_PROTOCOL_ERROR mesmo com close “limpo”.
 */

import {
  SSE_HEARTBEAT_MS,
  SSE_MAX_STREAM_MS,
  SSE_RECONNECT_DATA,
  SSE_RECONNECT_SIGNAL_MS,
} from '@/lib/sse-protocol'

export const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-store, no-transform',
  'X-Accel-Buffering': 'no',
} as const

type SubscribeFn = (onPing: () => void) => () => void

/**
 * Stream SSE: comentário inicial + keep-alive + `data: ping` via `subscribe`.
 * Qualquer falha de escrita limpa timers/sub e fecha o controller.
 */
export function createSsePingResponse(
  subscribe: SubscribeFn,
  signal?: AbortSignal,
): Response {
  const encoder = new TextEncoder()
  let unsubscribe: () => void = () => {}
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let reconnectSignal: ReturnType<typeof setTimeout> | undefined
  let maxLife: ReturnType<typeof setTimeout> | undefined
  let closed = false
  let onAbort: (() => void) | undefined

  const stream = new ReadableStream({
    start(controller) {
      const cleanup = () => {
        if (closed) return
        closed = true
        unsubscribe()
        if (heartbeat) clearInterval(heartbeat)
        if (reconnectSignal) clearTimeout(reconnectSignal)
        if (maxLife) clearTimeout(maxLife)
        if (onAbort) signal?.removeEventListener('abort', onAbort)
      }

      const closeClean = () => {
        cleanup()
        try {
          controller.close()
        } catch {
          /* já fechado */
        }
      }

      onAbort = () => {
        closeClean()
      }

      const safeEnqueue = (chunk: string): boolean => {
        if (closed) return false
        try {
          controller.enqueue(encoder.encode(chunk))
          return true
        } catch {
          closeClean()
          return false
        }
      }

      if (signal?.aborted) {
        onAbort()
        return
      }
      signal?.addEventListener('abort', onAbort)

      // Flush imediato — proxies HTTP/2 precisam de bytes cedo.
      // `retry:` é informativo; o client usa fetch (não EventSource nativo).
      safeEnqueue('retry: 5000\n: connected\n\n')

      unsubscribe = subscribe(() => {
        safeEnqueue('data: ping\n\n')
      })

      heartbeat = setInterval(() => {
        if (!safeEnqueue(': keep-alive\n\n')) return
      }, SSE_HEARTBEAT_MS)

      reconnectSignal = setTimeout(() => {
        // Client fecha e reabre limpo (fetch abort → canceled, não PROTOCOL_ERROR).
        safeEnqueue(`data: ${SSE_RECONNECT_DATA}\n\n`)
      }, SSE_RECONNECT_SIGNAL_MS)

      maxLife = setTimeout(() => {
        safeEnqueue(': bye\n\n')
        closeClean()
      }, SSE_MAX_STREAM_MS)
    },
    cancel() {
      closed = true
      unsubscribe()
      if (heartbeat) clearInterval(heartbeat)
      if (reconnectSignal) clearTimeout(reconnectSignal)
      if (maxLife) clearTimeout(maxLife)
      if (onAbort) signal?.removeEventListener('abort', onAbort)
    },
  })

  return new Response(stream, { headers: SSE_HEADERS })
}
