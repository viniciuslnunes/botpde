import { NextResponse } from 'next/server'
import { db } from '@torcida/db'
import { assertConversaAccess } from '@/lib/mensageria-api'
import { getTicketPorConversaId } from '@/lib/loja-ticket'
import { idCurtoPedido } from '@torcida/types'

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: conversaId } = await context.params
    await assertConversaAccess(conversaId)

    const ticket = await getTicketPorConversaId(conversaId)
    if (!ticket) {
      return NextResponse.json({ ticket: null })
    }

    const pedido: { status: string; modalidadeEntrega: string } | null =
      await db.saasPedido.findUnique({
        where: { id: ticket.pedidoId },
        select: { status: true, modalidadeEntrega: true },
      })
    if (!pedido) {
      return NextResponse.json({ ticket: null })
    }

    return NextResponse.json({
      ticket: {
        ticketId: ticket.id,
        status: ticket.status,
        modalidadeEntrega: pedido.modalidadeEntrega,
        pedidoIdCurto: idCurtoPedido(ticket.pedidoId),
        pedidoStatus: pedido.status,
        motivoFecho: ticket.motivoFecho,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao carregar ticket.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
