import { NextResponse } from 'next/server'
import { marcarConversaLida } from '@/lib/mensageria'
import { assertConversaAccess } from '@/lib/mensageria-api'

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: conversaId } = await context.params
    const { userId } = await assertConversaAccess(conversaId)
    await marcarConversaLida(conversaId, userId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao marcar como lida.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
