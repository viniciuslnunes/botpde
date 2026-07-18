/**
 * Helper para rotas SSE de ping (notificações, feed, mensagens).
 *
 * Railway/Fastly + HTTP/2:
 * - sem `Connection`/`Keep-Alive` (hop-by-hop → ERR_HTTP2_PROTOCOL_ERROR)
 * - sem `Content-Encoding` (valor inventado tipo `none` também quebra H2 no Chrome)
 * - `no-transform` pede ao proxy para não comprimir o stream
 * - heartbeat evita idle cut; close limpo antes do teto do proxy
 * - enqueue após close também gera PROTOCOL_ERROR
 */

export const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-store, no-transform',
  'X-Accel-Buffering': 'no',
} as const

const HEARTBEAT_MS = 15_000
/** Fecha limpo antes do proxy HTTP/2 cortar sujo (~5–15 min). */
const MAX_STREAM_MS = 55_000

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
      // `retry:` reduz martelada do EventSource nativo se a gente fechar.
      safeEnqueue('retry: 5000\n: connected\n\n')

      unsubscribe = subscribe(() => {
        safeEnqueue('data: ping\n\n')
      })

      heartbeat = setInterval(() => {
        if (!safeEnqueue(': keep-alive\n\n')) return
      }, HEARTBEAT_MS)

      maxLife = setTimeout(() => {
        // Bye limpo → cliente reconecta sem RST PROTOCOL_ERROR.
        safeEnqueue(': bye\n\n')
        closeClean()
      }, MAX_STREAM_MS)
    },
    cancel() {
      closed = true
      unsubscribe()
      if (heartbeat) clearInterval(heartbeat)
      if (maxLife) clearTimeout(maxLife)
      if (onAbort) signal?.removeEventListener('abort', onAbort)
    },
  })

  return new Response(stream, { headers: SSE_HEADERS })
}
