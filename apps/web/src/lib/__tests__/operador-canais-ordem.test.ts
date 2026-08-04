import { describe, expect, it } from 'vitest'
import {
  abrirCanalNaOrdem,
  moverItem,
  reordenarCanaisOperador,
} from '@/lib/operador-canais-ordem'

describe('abrirCanalNaOrdem', () => {
  it('não traz para a frente um canal já aberto', () => {
    expect(abrirCanalNaOrdem(['a', 'b', 'c'], 'b')).toEqual(['a', 'b', 'c'])
  })

  it('anexa canal novo ao fim', () => {
    expect(abrirCanalNaOrdem(['a', 'b'], 'c')).toEqual(['a', 'b', 'c'])
  })

  it('estoura o teto removendo o mais antigo à esquerda', () => {
    expect(abrirCanalNaOrdem(['a', 'b'], 'c', 2)).toEqual(['b', 'c'])
  })
})

describe('reordenarCanaisOperador', () => {
  it('aceita permutação válida', () => {
    expect(reordenarCanaisOperador(['a', 'b', 'c'], ['c', 'a', 'b'])).toEqual([
      'c',
      'a',
      'b',
    ])
  })

  it('rejeita ordem incompleta ou com extras', () => {
    expect(reordenarCanaisOperador(['a', 'b'], ['a'])).toBeNull()
    expect(reordenarCanaisOperador(['a', 'b'], ['a', 'b', 'c'])).toBeNull()
    expect(reordenarCanaisOperador(['a', 'b'], ['a', 'a'])).toBeNull()
  })
})

describe('moverItem', () => {
  it('move índice na lista', () => {
    expect(moverItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
    expect(moverItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
  })
})
