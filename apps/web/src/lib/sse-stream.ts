/**
 * Helper para rotas de ping via long-poll (notificações, feed, mensagens).
 *
 * Railway/Fastly + HTTP/2:
 * - streams longos (minutos) → RST do edge → ERR_HTTP2_PROTOCOL_ERROR
 * - hold sem TTFB (Promise que só resolve no ping|idle) → 502
 *   "Application failed to respond" no edge
 * - long-poll: flush imediato (`: connected`) + fecha em ≤ ~25s com
 *   `data: ping|idle` — TTFB baixo e body finito
 * - sem `Connection`/`Keep-Alive` (hop-by-hop)
 * - sem `Content-Encoding` (valor inventado tipo `none` também quebra H2)
 * - `no-transform` pede ao proxy para não comprimir o body
 */

import {
  SSE_IDLE_DATA,
  SSE_LONG_POLL_MS,
  SSE_PING_DATA,
} from '@/lib/sse-protocol'

export const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-store, no-transform',
  'X-Accel-Buffering': 'no',
} as const

type SubscribeFn = (onPing: () => void) => () => void

/**
 * Long-poll com flush imediato: headers + `: connected` saem na hora;
 * o stream fecha no primeiro ping ou no idle (≤ SSE_LONG_POLL_MS).
 */
export function createSsePingResponse(
  subscribe: SubscribeFn,
  signal?: AbortSignal,
): Response {
  const encoder = new TextEncoder()
  let unsubscribe: () => void = () => {}
  let timer: ReturnType<typeof setTimeout> | undefined
  let closed = false
  let onAbort: (() => void) | undefined

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const cleanup = () => {
        if (closed) return
        closed = true
        unsubscribe()
        if (timer) clearTimeout(timer)
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

      const finish = (data: string) => {
        if (closed) return
        safeEnqueue(`data: ${data}\n\n`)
        closeClean()
      }

      onAbort = () => {
        closeClean()
      }

      if (signal?.aborted) {
        onAbort()
        return
      }
      signal?.addEventListener('abort', onAbort)

      // TTFB imediato — sem isso o edge Railway devolve 502 no hold longo.
      safeEnqueue('retry: 5000\n: connected\n\n')

      unsubscribe = subscribe(() => {
        finish(SSE_PING_DATA)
      })

      timer = setTimeout(() => {
        finish(SSE_IDLE_DATA)
      }, SSE_LONG_POLL_MS)
    },
    cancel() {
      if (closed) return
      closed = true
      unsubscribe()
      if (timer) clearTimeout(timer)
      if (onAbort) signal?.removeEventListener('abort', onAbort)
    },
  })

  return new Response(stream, { headers: SSE_HEADERS })
}
