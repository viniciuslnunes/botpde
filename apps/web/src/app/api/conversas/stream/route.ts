import { auth } from '@/lib/auth'
import { subscribeInboxMensagem } from '@/lib/mensageria-bus'

export const dynamic = 'force-dynamic'

/**
 * SSE de pings da inbox de mensagens. Client refetcha lista/resumo;
 * polling permanece como fallback.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return new Response('Não autenticado', { status: 401 })
  }
  const userId = session.user.id

  const encoder = new TextEncoder()
  let unsubscribe: () => void = () => {}
  let heartbeat: ReturnType<typeof setInterval> | undefined

  const stream = new ReadableStream({
    start(controller) {
      unsubscribe = subscribeInboxMensagem(userId, () => {
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
}
