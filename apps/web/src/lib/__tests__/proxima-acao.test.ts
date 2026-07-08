import { describe, expect, it } from 'vitest'
import { resolverProximaAcao, type EventoParaAcao } from '@/lib/proxima-acao'

const evento = (id: string, diasNoFuturo = 1): EventoParaAcao => ({
  id,
  titulo: `Evento ${id}`,
  data: new Date(Date.now() + diasNoFuturo * 24 * 60 * 60 * 1000),
})

describe('resolverProximaAcao', () => {
  it('membro aprovado sem RSVP no próximo evento → CONFIRMAR_PRESENCA', () => {
    const acao = resolverProximaAcao([evento('e1')], new Map(), true)
    expect(acao).toEqual({ tipo: 'CONFIRMAR_PRESENCA', evento: expect.objectContaining({ id: 'e1' }) })
  })

  it('já confirmou o mais próximo → PRESENCA_CONFIRMADA (reforço, não cobrança)', () => {
    const acao = resolverProximaAcao([evento('e1')], new Map([['e1', 'CONFIRMADO' as const]]), true)
    expect(acao?.tipo).toBe('PRESENCA_CONFIRMADA')
  })

  it('recusou o mais próximo → avalia o seguinte sem cobrar o recusado', () => {
    const acao = resolverProximaAcao(
      [evento('e1'), evento('e2', 3)],
      new Map([['e1', 'RECUSADO' as const]]),
      true,
    )
    expect(acao).toEqual({ tipo: 'CONFIRMAR_PRESENCA', evento: expect.objectContaining({ id: 'e2' }) })
  })

  it('recusou todos → nenhuma ação', () => {
    const acao = resolverProximaAcao(
      [evento('e1'), evento('e2', 3)],
      new Map([
        ['e1', 'RECUSADO' as const],
        ['e2', 'RECUSADO' as const],
      ]),
      true,
    )
    expect(acao).toBeNull()
  })

  it('membro não aprovado → nenhuma ação de evento (hero cobre cadastro)', () => {
    expect(resolverProximaAcao([evento('e1')], new Map(), false)).toBeNull()
  })

  it('sem eventos futuros → nenhuma ação', () => {
    expect(resolverProximaAcao([], new Map(), true)).toBeNull()
  })
})
