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

  return createSsePingResponse((onPing) =>
    subscribeNotificacaoPing(tenantId, userId, onPing),
  )
}
