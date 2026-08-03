/**
 * Ticket de atendimento pós-compra na loja.
 * Transições puras (sem Prisma) — fila "primeiro que atender" + fecho.
 */

/** @typedef {'ABERTO' | 'ATENDENDO' | 'FECHADO'} PedidoTicketStatus */
/** @typedef {'ENTREGUE' | 'MANUAL' | 'CANCELADO'} PedidoTicketMotivoFecho */

/** @type {Readonly<Record<PedidoTicketStatus, { label: string, tom: 'warning' | 'info' | 'neutral' }>>} */
export const STATUS_PEDIDO_TICKET = Object.freeze({
  ABERTO: { label: 'Na fila', tom: 'warning' },
  ATENDENDO: { label: 'Em atendimento', tom: 'info' },
  FECHADO: { label: 'Fechado', tom: 'neutral' },
})

/** @type {Readonly<Record<PedidoTicketMotivoFecho, string>>} */
export const MOTIVO_FECHO_PEDIDO_TICKET = Object.freeze({
  ENTREGUE: 'Pedido entregue',
  MANUAL: 'Fechado pelo gestor',
  CANCELADO: 'Pedido cancelado',
})

export const STATUS_PEDIDO_TICKET_ABERTOS = Object.freeze(/** @type {const} */ (['ABERTO', 'ATENDENDO']))

/**
 * Nome curto da conversa do ticket.
 * @param {{ idCurto: string, modalidade?: string | null }} input
 */
export function nomeConversaPedidoTicket(input) {
  const id = (input.idCurto ?? '').trim() || 'pedido'
  const mod = input.modalidade === 'ENVIO' ? 'Envio' : 'Retirada'
  return `Pedido · ${id} · ${mod}`.slice(0, 80)
}

/**
 * Prefixo do id do pedido para UI (8 chars).
 * @param {string} pedidoId
 */
export function idCurtoPedido(pedidoId) {
  return String(pedidoId ?? '').replace(/-/g, '').slice(0, 8).toUpperCase() || 'PEDIDO'
}

/**
 * Claim: só de ABERTO → ATENDENDO.
 * @param {PedidoTicketStatus} statusAtual
 * @returns {{ ok: true, status: 'ATENDENDO' } | { ok: false, erro: string }}
 */
export function podeAtenderTicket(statusAtual) {
  if (statusAtual === 'ABERTO') return { ok: true, status: 'ATENDENDO' }
  if (statusAtual === 'ATENDENDO') return { ok: false, erro: 'Este ticket já está em atendimento.' }
  if (statusAtual === 'FECHADO') return { ok: false, erro: 'Este ticket já foi fechado.' }
  return { ok: false, erro: 'Status de ticket inválido.' }
}

/**
 * Fecho: ABERTO ou ATENDENDO → FECHADO.
 * @param {PedidoTicketStatus} statusAtual
 * @param {PedidoTicketMotivoFecho} motivo
 * @returns {{ ok: true, status: 'FECHADO', motivo: PedidoTicketMotivoFecho } | { ok: false, erro: string }}
 */
export function podeFecharTicket(statusAtual, motivo) {
  if (motivo !== 'ENTREGUE' && motivo !== 'MANUAL' && motivo !== 'CANCELADO') {
    return { ok: false, erro: 'Motivo de fechamento inválido.' }
  }
  if (statusAtual === 'FECHADO') {
    return { ok: false, erro: 'Este ticket já foi fechado.' }
  }
  if (statusAtual !== 'ABERTO' && statusAtual !== 'ATENDENDO') {
    return { ok: false, erro: 'Status de ticket inválido.' }
  }
  return { ok: true, status: 'FECHADO', motivo }
}

/**
 * Envio de mensagem só enquanto o ticket não está fechado.
 * Sem ticket ligado à conversa → permite (conversa social normal).
 * @param {PedidoTicketStatus | null | undefined} statusTicket
 */
export function ticketPermiteEnvio(statusTicket) {
  if (statusTicket == null) return true
  return statusTicket !== 'FECHADO'
}

/**
 * Motivo automático ao mudar status do pedido.
 * @param {'PENDENTE' | 'CONFIRMADO' | 'CANCELADO' | 'ENTREGUE' | string} statusPedido
 * @returns {PedidoTicketMotivoFecho | null}
 */
export function motivoFechoPorStatusPedido(statusPedido) {
  if (statusPedido === 'ENTREGUE') return 'ENTREGUE'
  if (statusPedido === 'CANCELADO') return 'CANCELADO'
  return null
}
