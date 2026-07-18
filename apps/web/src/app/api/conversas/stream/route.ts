import { auth } from '@/lib/auth'
import { subscribeInboxMensagem } from '@/lib/mensageria-bus'
import { createSsePingResponse } from '@/lib/sse-stream'

export const dynamic = 'force-dynamic'

/**
 * SSE de pings da inbox de mensagens. Client refetcha lista/resumo;
 * polling permanece como fallback.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return new Response('Não autenticado', { status: 401 })
  }
  const userId = session.user.id

  return createSsePingResponse((onPing) => subscribeInboxMensagem(userId, onPing))
}
