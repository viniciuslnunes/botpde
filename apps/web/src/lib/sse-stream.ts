/**
 * Helper para rotas de ping via long-poll (notificações, feed, mensagens).
 *
 * Railway/Fastly + HTTP/2:
 * - streams longos (`ReadableStream` aberto) → RST do edge →
 *   ERR_HTTP2_PROTOCOL_ERROR 200 no Chrome
 * - long-poll devolve Response finita (ping|idle) em ≤ ~25s — sem mid-stream RST
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

function sseBody(data: string): string {
  return `retry: 5000\n: connected\n\ndata: ${data}\n\n`
}

/**
 * Long-poll: segura até o primeiro ping via `subscribe` ou timeout.
 * Devolve body SSE curto e completo (não stream contínuo).
 */
export function createSsePingResponse(
  subscribe: SubscribeFn,
  signal?: AbortSignal,
): Promise<Response> {
  return new Promise((resolve) => {
    let settled = false
    let unsubscribe: () => void = () => {}
    let timer: ReturnType<typeof setTimeout> | undefined
    let onAbort: (() => void) | undefined

    const finish = (data: string) => {
      if (settled) return
      settled = true
      unsubscribe()
      if (timer) clearTimeout(timer)
      if (onAbort) signal?.removeEventListener('abort', onAbort)
      resolve(new Response(sseBody(data), { headers: SSE_HEADERS }))
    }

    onAbort = () => {
      if (settled) return
      settled = true
      unsubscribe()
      if (timer) clearTimeout(timer)
      // Cliente já abortou — body mínimo só para a Promise resolver.
      resolve(new Response(': aborted\n\n', { headers: SSE_HEADERS }))
    }

    if (signal?.aborted) {
      onAbort()
      return
    }
    signal?.addEventListener('abort', onAbort)

    unsubscribe = subscribe(() => {
      finish(SSE_PING_DATA)
    })

    timer = setTimeout(() => {
      finish(SSE_IDLE_DATA)
    }, SSE_LONG_POLL_MS)
  })
}
