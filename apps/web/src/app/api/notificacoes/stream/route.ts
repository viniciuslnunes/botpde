import { auth } from '@/lib/auth'
import { resolveTenantIdPortalComunidade } from '@/lib/comunidade-contexto'
import {
  subscribeNotificacaoPing,
  subscribeNotificacaoPingUsuario,
} from '@/lib/notificacoes-bus'
import { createSsePingResponse } from '@/lib/sse-stream'
import { getTenantFromHost } from '@/lib/tenant'
import { isSuperAdminEmail } from '@/lib/tenant-context'

export const dynamic = 'force-dynamic'

/**
 * SSE de pings de notificação — compartilhado entre portal e admin. O client
 * (useNotificationStream) só recebe "tem novidade" e refaz o fetch da lista;
 * o polling existente continua como fallback.
 *
 * `?escopo=admin` resolve o tenant por `getTenantFromHost` — mesma fonte de
 * `/api/admin/navbar-context` — em vez do tenant contextual do portal
 * (`resolveTenantIdPortalComunidade`). Sem isso, super-admin operando outra
 * torcida ou liderança com vínculo em mais de uma torcida assina o ping do
 * tenant errado no admin e só recebe o badge no polling de 20s.
 *
 * `?escopo=plataforma` assina a chave por usuário (cross-tenant) — sino do
 * console super-admin.
 */
export async function GET(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return new Response('Não autenticado', { status: 401 })
    }

    const escopo = new URL(request.url).searchParams.get('escopo')
    if (escopo === 'plataforma') {
      if (!isSuperAdminEmail(session.user.email)) {
        return new Response('Proibido', { status: 403 })
      }
      return createSsePingResponse(
        (onPing) => subscribeNotificacaoPingUsuario(session.user.id, onPing),
        request.signal,
      )
    }
    const tenantId =
      escopo === 'admin'
        ? ((await getTenantFromHost())?.id ?? null)
        : await resolveTenantIdPortalComunidade(session.user.id, session.user.email)
    if (!tenantId) {
      // Sem tenant: stream ocioso (polling da navbar é o fallback). 404
      // no EventSource aparecia no console a cada reconnect.
      return createSsePingResponse(() => () => {}, request.signal)
    }

    const userId = session.user.id

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
