import { describe, it, expect } from 'vitest'
import {
  idCurtoPedido,
  motivoFechoPorStatusPedido,
  nomeConversaPedidoTicket,
  podeAtenderTicket,
  podeFecharTicket,
  ticketPermiteEnvio,
} from '@torcida/types'

describe('loja-ticket — nome e id', () => {
  it('gera id curto estável', () => {
    expect(idCurtoPedido('abcdef12-3456-7890-abcd-ef1234567890')).toBe('ABCDEF12')
  })

  it('monta nome da conversa', () => {
    expect(nomeConversaPedidoTicket({ idCurto: 'ABCDEF12', modalidade: 'RETIRADA' })).toBe(
      'Pedido · ABCDEF12 · Retirada',
    )
    expect(nomeConversaPedidoTicket({ idCurto: 'ABCDEF12', modalidade: 'ENVIO' })).toContain(
      'Envio',
    )
  })
})

describe('loja-ticket — transições', () => {
  it('só atende a partir de ABERTO', () => {
    expect(podeAtenderTicket('ABERTO').ok).toBe(true)
    expect(podeAtenderTicket('ATENDENDO').ok).toBe(false)
    expect(podeAtenderTicket('FECHADO').ok).toBe(false)
  })

  it('fecha ABERTO ou ATENDENDO', () => {
    expect(podeFecharTicket('ABERTO', 'MANUAL')).toEqual({
      ok: true,
      status: 'FECHADO',
      motivo: 'MANUAL',
    })
    expect(podeFecharTicket('ATENDENDO', 'ENTREGUE').ok).toBe(true)
    expect(podeFecharTicket('FECHADO', 'MANUAL').ok).toBe(false)
    expect(podeFecharTicket('ABERTO', 'X' as 'MANUAL').ok).toBe(false)
  })

  it('bloqueia envio quando fechado', () => {
    expect(ticketPermiteEnvio(null)).toBe(true)
    expect(ticketPermiteEnvio('ABERTO')).toBe(true)
    expect(ticketPermiteEnvio('ATENDENDO')).toBe(true)
    expect(ticketPermiteEnvio('FECHADO')).toBe(false)
  })

  it('mapeia status do pedido para motivo de fecho', () => {
    expect(motivoFechoPorStatusPedido('ENTREGUE')).toBe('ENTREGUE')
    expect(motivoFechoPorStatusPedido('CANCELADO')).toBe('CANCELADO')
    expect(motivoFechoPorStatusPedido('CONFIRMADO')).toBeNull()
  })
})
