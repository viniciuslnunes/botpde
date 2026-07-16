import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'
import { subscribeNotificacaoPing } from '@/lib/notificacoes-bus'

export const dynamic = 'force-dynamic'

/**
 * SSE de pings de notificação — compartilhado entre portal e admin. O client
 * (useNotificationStream) só recebe "tem novidade" e refaz o fetch da lista;
 * o polling existente continua como fallback.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return new Response('Não autenticado', { status: 401 })
  }
  const tenant = await getTenantFromHost()
  if (!tenant) {
    return new Response('Tenant não encontrado', { status: 404 })
  }
  const userId = session.user.id
  const tenantId = tenant.id

  const encoder = new TextEncoder()
  let unsubscribe: () => void = () => {}
  let heartbeat: ReturnType<typeof setInterval> | undefined

  const stream = new ReadableStream({
    start(controller) {
      unsubscribe = subscribeNotificacaoPing(tenantId, userId, () => {
        controller.enqueue(encoder.encode('data: ping\n\n'))
      })
      // Keep-alive: evita que proxies fechem a conexão ociosa.
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
