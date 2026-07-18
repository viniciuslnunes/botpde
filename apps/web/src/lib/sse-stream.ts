/**
 * Helper para rotas SSE de ping (notificações, feed, mensagens).
 *
 * Railway encerra HTTP/2 ~5 min e o proxy pode bufferizar sem
 * `X-Accel-Buffering: no`. Enqueue após close gera ERR_HTTP2_PROTOCOL_ERROR.
 */

export const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
} as const

const HEARTBEAT_MS = 15_000

type SubscribeFn = (onPing: () => void) => () => void

/**
 * Stream SSE: comentário inicial + keep-alive + `data: ping` via `subscribe`.
 * Qualquer falha de escrita limpa timers/sub e fecha o controller.
 */
export function createSsePingResponse(subscribe: SubscribeFn): Response {
  const encoder = new TextEncoder()
  let unsubscribe: () => void = () => {}
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let closed = false

  const stream = new ReadableStream({
    start(controller) {
      const cleanup = () => {
        if (closed) return
        closed = true
        unsubscribe()
        if (heartbeat) clearInterval(heartbeat)
      }

      const safeEnqueue = (chunk: string): boolean => {
        if (closed) return false
        try {
          controller.enqueue(encoder.encode(chunk))
          return true
        } catch {
          cleanup()
          try {
            controller.close()
          } catch {
            /* já fechado */
          }
          return false
        }
      }

      // Flush imediato — proxies HTTP/2 precisam de bytes cedo.
      safeEnqueue(': connected\n\n')

      unsubscribe = subscribe(() => {
        safeEnqueue('data: ping\n\n')
      })

      heartbeat = setInterval(() => {
        if (!safeEnqueue(': keep-alive\n\n')) return
      }, HEARTBEAT_MS)
    },
    cancel() {
      closed = true
      unsubscribe()
      if (heartbeat) clearInterval(heartbeat)
    },
  })

  return new Response(stream, { headers: SSE_HEADERS })
}
