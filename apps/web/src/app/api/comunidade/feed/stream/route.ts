import { auth } from '@/lib/auth'
import { assertComunidadeNacional } from '@/lib/authz'
import { resolveTenantMinhaTorcida } from '@/lib/comunidade-contexto'
import { subscribeFeedNacionalPing, subscribeFeedPing } from '@/lib/feed-bus'
import { createSsePingResponse } from '@/lib/sse-stream'
import { isSuperAdminEmail } from '@/lib/tenant-context'

export const dynamic = 'force-dynamic'

/**
 * SSE de pings do feed da Comunidade. O client (useFeedStream) só recebe
 * "tem post novo" e mostra o banner de novos posts — a lista em si continua
 * SSR, atualizada quando o membro clica para voltar ao topo do feed.
 *
 * Torcida: canal por vínculo do usuário (nunca TENANT_SLUG do deploy).
 * Nacional: `?escopo=nacional&afiliacaoId=` — torcedor global sem subdomínio de torcida.
 */
export async function GET(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return new Response('Não autenticado', { status: 401 })
    }

    const url = new URL(request.url)
    const escopo = url.searchParams.get('escopo')
    const afiliacaoParam = url.searchParams.get('afiliacaoId')

    if (escopo === 'nacional') {
      // Super-admin: ping do clube pedido na query (CN do tenant em foco).
      if (isSuperAdminEmail(session.user.email) && afiliacaoParam) {
        return createSsePingResponse(
          (onPing) => subscribeFeedNacionalPing(afiliacaoParam, onPing),
          request.signal,
        )
      }
      const { afiliacaoId } = await assertComunidadeNacional()
      if (afiliacaoParam && afiliacaoParam !== afiliacaoId) {
        return new Response('Afiliação inválida', { status: 403 })
      }
      return createSsePingResponse(
        (onPing) => subscribeFeedNacionalPing(afiliacaoId, onPing),
        request.signal,
      )
    }

    const tenant = await resolveTenantMinhaTorcida(session.user.id, session.user.email)
    if (!tenant) {
      return new Response('Tenant não encontrado', { status: 404 })
    }

    return createSsePingResponse(
      (onPing) => subscribeFeedPing(tenant.id, onPing),
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
