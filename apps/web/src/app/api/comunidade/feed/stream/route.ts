import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'
import { subscribeFeedPing } from '@/lib/feed-bus'
import { createSsePingResponse } from '@/lib/sse-stream'

export const dynamic = 'force-dynamic'

/**
 * SSE de pings do feed da Comunidade. O client (useFeedStream) só recebe
 * "tem post novo" e mostra o banner de novos posts — a lista em si continua
 * SSR, atualizada quando o membro clica para voltar ao topo do feed.
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
    const tenantId = tenant.id

    return createSsePingResponse(
      (onPing) => subscribeFeedPing(tenantId, onPing),
      request.signal,
    )
  } catch (err) {
    // Blip de conexão do proxy Railway (P1001/P1017) em auth()/tenant não pode
    // virar 500 não-capturado: ping best-effort, feed continua SSR. 503
    // controlado → client faz backoff e reconecta.
    console.warn(
      '[comunidade/feed/stream] indisponível (fallback SSR):',
      err instanceof Error ? err.message : err,
    )
    return new Response('Serviço de ping indisponível', { status: 503 })
  }
}
