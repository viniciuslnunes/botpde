import { auth } from '@/lib/auth'
import { subscribeInboxMensagem } from '@/lib/mensageria-bus'
import { createSsePingResponse } from '@/lib/sse-stream'

export const dynamic = 'force-dynamic'

/**
 * SSE de pings da inbox de mensagens. Client refetcha lista/resumo;
 * polling permanece como fallback.
 */
export async function GET(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return new Response('Não autenticado', { status: 401 })
    }
    const userId = session.user.id

    return createSsePingResponse(
      (onPing) => subscribeInboxMensagem(userId, onPing),
      request.signal,
    )
  } catch (err) {
    // Blip de conexão do proxy Railway (P1001/P1017) em auth() não pode virar
    // 500 não-capturado: ping best-effort, polling é o fallback. 503 controlado
    // → client faz backoff e reconecta.
    console.warn(
      '[conversas/stream] indisponível (fallback polling):',
      err instanceof Error ? err.message : err,
    )
    return new Response('Serviço de ping indisponível', { status: 503 })
  }
}
