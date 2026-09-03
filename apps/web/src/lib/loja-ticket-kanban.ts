import 'server-only'

import {
  idCurtoPedido,
  MOTIVO_FECHO_PEDIDO_TICKET,
} from '@torcida/types'
import { slaLabel } from '@/lib/admin-inbox'
import type { KanbanTickets, TicketFilaItem } from '@/lib/loja-ticket'

const LABEL_PEDIDO: Record<string, string> = {
  PENDENTE: 'Pendente',
  CONFIRMADO: 'Confirmado',
  ENTREGUE: 'Entregue',
  CANCELADO: 'Cancelado',
}

export type TicketKanbanCardUi = {
  id: string
  status: 'ABERTO' | 'ATENDENDO' | 'FECHADO'
  conversaId: string
  pedidoId: string
  idCurto: string
  abertoEmLabel: string
  atendidoEmLabel: string | null
  fechadoEmLabel: string | null
  motivoFechoLabel: string | null
  clienteNome: string
  totalLabel: string
  modalidadeLabel: string
  pedidoStatus: string
  pedidoStatusLabel: string
  itensResumo: string
  atendenteNome: string | null
  /** Pedido ainda não confirmado pela loja — ação típica antes/durante atendimento. */
  aguardaConfirmacao: boolean
  cupomCodigo: string | null
  /** Tempo na fila ou desde abertura (ex.: "há 2h"). */
  slaLabel: string | null
}

export type TicketKanbanBoardUi = {
  abertos: TicketKanbanCardUi[]
  atendendo: TicketKanbanCardUi[]
  fechados: TicketKanbanCardUi[]
}

function formatarPreco(preco: unknown) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    Number(preco),
  )
}

function formatarData(data: Date | null | undefined) {
  if (!data) return null
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(data))
}

function serializarTicketCard(ticket: TicketFilaItem): TicketKanbanCardUi {
  const itens = ticket.pedido.itens
  const itensResumo =
    itens.length === 0
      ? 'Sem itens'
      : itens.length === 1
        ? `${itens[0]!.produtoNome}${itens[0]!.tamanho ? ` (${itens[0]!.tamanho})` : ''} × ${itens[0]!.quantidade}`
        : `${itens[0]!.produtoNome}${itens.length > 1 ? ` +${itens.length - 1}` : ''}`

  const pedidoStatus = ticket.pedido.status
  const pedidoStatusLabel = LABEL_PEDIDO[pedidoStatus] ?? pedidoStatus
  const referenciaSla =
    ticket.status === 'FECHADO' && ticket.fechadoEm
      ? ticket.fechadoEm
      : ticket.status === 'ATENDENDO' && ticket.atendidoEm
        ? ticket.atendidoEm
        : ticket.abertoEm

  return {
    id: ticket.id,
    status: ticket.status,
    conversaId: ticket.conversaId,
    pedidoId: ticket.pedidoId,
    idCurto: idCurtoPedido(ticket.pedidoId),
    abertoEmLabel: formatarData(ticket.abertoEm) ?? '—',
    atendidoEmLabel: formatarData(ticket.atendidoEm),
    fechadoEmLabel: formatarData(ticket.fechadoEm),
    motivoFechoLabel: ticket.motivoFecho
      ? (MOTIVO_FECHO_PEDIDO_TICKET[ticket.motivoFecho] ?? ticket.motivoFecho)
      : null,
    clienteNome: ticket.pedido.user.nome ?? ticket.pedido.user.email ?? '—',
    totalLabel: formatarPreco(ticket.pedido.total),
    modalidadeLabel: ticket.pedido.modalidadeEntrega === 'ENVIO' ? 'Envio' : 'Retirada',
    pedidoStatus,
    pedidoStatusLabel,
    itensResumo,
    atendenteNome: ticket.atendente?.nome ?? null,
    aguardaConfirmacao: pedidoStatus === 'PENDENTE',
    cupomCodigo: ticket.pedido.cupomCodigo,
    slaLabel: slaLabel(referenciaSla, { modo: 'idade' }),
  }
}

export function serializarKanbanTickets(kanban: KanbanTickets): TicketKanbanBoardUi {
  return {
    abertos: kanban.abertos.map(serializarTicketCard),
    atendendo: kanban.atendendo.map(serializarTicketCard),
    fechados: kanban.fechados.map(serializarTicketCard),
  }
}
