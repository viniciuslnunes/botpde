import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'
import { subscribeNotificacaoPing } from '@/lib/notificacoes-bus'
import { createSsePingResponse } from '@/lib/sse-stream'

export const dynamic = 'force-dynamic'

/**
 * SSE de pings de notificação — compartilhado entre portal e admin. O client
 * (useNotificationStream) só recebe "tem novidade" e refaz o fetch da lista;
 * o polling existente continua como fallback.
 */
export async function GET(request: Request) {
  try {
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

    return createSsePingResponse(
      (onPing) => subscribeNotificacaoPing(tenantId, userId, onPing),
      request.signal,
    )
  } catch (err) {
    // Blip de conexão do proxy Railway (P1001/P1017) em auth()/tenant não pode
    // virar 500 não-capturado no Sentry: o ping é best-effort e o polling da
    // navbar é o fallback. 503 controlado → o client faz backoff e reconecta.
    console.warn(
      '[notificacoes/stream] indisponível (fallback polling):',
      err instanceof Error ? err.message : err,
    )
    return new Response('Serviço de ping indisponível', { status: 503 })
  }
}
