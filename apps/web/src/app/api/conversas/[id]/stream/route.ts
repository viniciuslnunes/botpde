import { subscribeConversaMensagem } from '@/lib/mensageria-bus'
import { assertConversaAccess } from '@/lib/mensageria-api'
import { createSsePingResponse } from '@/lib/sse-stream'

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

    return createSsePingResponse((onPing) =>
      subscribeConversaMensagem(conversaId, onPing),
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Não autorizado'
    const status = message.includes('autentic') ? 401 : 403
    return new Response(message, { status })
  }
}
