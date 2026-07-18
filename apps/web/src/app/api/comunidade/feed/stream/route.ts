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
}
