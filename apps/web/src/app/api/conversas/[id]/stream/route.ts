import { subscribeConversaMensagem } from '@/lib/mensageria-bus'
import { assertConversaAccess } from '@/lib/mensageria-api'

export const dynamic = 'force-dynamic'

/**
 * SSE de pings da thread aberta. Client faz fetch incremental;
 * polling com backoff continua como fallback.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: conversaId } = await context.params
    await assertConversaAccess(conversaId)

    const encoder = new TextEncoder()
    let unsubscribe: () => void = () => {}
    let heartbeat: ReturnType<typeof setInterval> | undefined

    const stream = new ReadableStream({
      start(controller) {
        unsubscribe = subscribeConversaMensagem(conversaId, () => {
          controller.enqueue(encoder.encode('data: ping\n\n'))
        })
        heartbeat = setInterval(() => {
          controller.enqueue(encoder.encode(': keep-alive\n\n'))
        }, 25_000)
      },
      cancel() {
        unsubscribe()
        if (heartbeat) clearInterval(heartbeat)
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Não autorizado'
    const status = message.includes('autentic') ? 401 : 403
    return new Response(message, { status })
  }
}
