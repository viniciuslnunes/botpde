import { subscribeConversaMensagem } from '@/lib/mensageria-bus'
import { assertConversaLeitura, statusErroMensageria } from '@/lib/mensageria-api'
import { createSsePingResponse } from '@/lib/sse-stream'

export const dynamic = 'force-dynamic'

/**
 * SSE de pings da thread aberta. Client faz fetch incremental;
 * polling com backoff continua como fallback.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: conversaId } = await context.params
    await assertConversaLeitura(conversaId)

    return createSsePingResponse(
      (onPing) => subscribeConversaMensagem(conversaId, onPing),
      request.signal,
    )
  } catch (error) {
    console.error('[api/conversas/[id]/stream GET]', error)
    const { message, status } = statusErroMensageria(error)
    return new Response(message, { status })
  }
}
