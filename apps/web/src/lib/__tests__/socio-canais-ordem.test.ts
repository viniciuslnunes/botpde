import { describe, expect, it } from 'vitest'
import {
  abrirCanalNaOrdem,
  moverItem,
  reordenarCanaisOperador,
} from '@/lib/operador-canais-ordem'

/**
 * Cookie `socio_canais_abertos` usa os mesmos helpers puros do operador
 * (ids de Conversa em vez de slugs de tenant).
 */
describe('ordem cookie sócio (helpers compartilhados)', () => {
  const a = '11111111-1111-4111-8111-111111111111'
  const b = '22222222-2222-4222-8222-222222222222'
  const c = '33333333-3333-4333-8333-333333333333'

  it('abrir não faz MRU — canal já aberto fica na mesma posição', () => {
    expect(abrirCanalNaOrdem([a, b, c], b)).toEqual([a, b, c])
  })

  it('abrir anexa id novo ao fim', () => {
    expect(abrirCanalNaOrdem([a, b], c)).toEqual([a, b, c])
  })

  it('abrir estoura teto removendo o mais antigo', () => {
    expect(abrirCanalNaOrdem([a, b], c, 2)).toEqual([b, c])
  })

  it('reordenar aceita permutação dos ids atuais', () => {
    expect(reordenarCanaisOperador([a, b, c], [c, a, b])).toEqual([c, a, b])
  })

  it('reordenar rejeita ordem inválida', () => {
    expect(reordenarCanaisOperador([a, b], [a])).toBeNull()
    expect(reordenarCanaisOperador([a, b], [a, b, c])).toBeNull()
  })

  it('fechar é filtro (ordem dos restantes preservada)', () => {
    const atuais = [a, b, c]
    expect(atuais.filter((id) => id !== b)).toEqual([a, c])
  })

  it('drag move índice na lista de ids', () => {
    expect(moverItem([a, b, c], 0, 2)).toEqual([b, c, a])
  })
})
