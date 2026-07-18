import { NextResponse } from 'next/server'
import { marcarConversaLida } from '@/lib/mensageria'
import { assertConversaLeitura, statusErroMensageria } from '@/lib/mensageria-api'

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: conversaId } = await context.params
    const { userId } = await assertConversaLeitura(conversaId)
    await marcarConversaLida(conversaId, userId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[api/conversas/[id]/ler POST]', error)
    const { message, status } = statusErroMensageria(error)
    return NextResponse.json({ error: message }, { status })
  }
}
