import { describe, expect, it } from 'vitest'
import {
  abrirCanalNaOrdem,
  aplicarOrdemArrastavel,
  moverItem,
  moverSlugArrastavel,
  ordemArrastavelSemFixos,
  reordenarCanaisOperador,
  slugsHierarquiaFixos,
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

describe('slugsHierarquiaFixos', () => {
  it('sem unidade: só torcida', () => {
    expect(
      slugsHierarquiaFixos({
        slugTorcida: 'gavioes',
        slugUnidade: null,
        temTorcida: true,
        temUnidade: false,
      }),
    ).toEqual(['gavioes'])
  })

  it('com unidade distinta: torcida + unidade', () => {
    expect(
      slugsHierarquiaFixos({
        slugTorcida: 'gavioes',
        slugUnidade: 'gavioes-pde-leste',
        temTorcida: true,
        temUnidade: true,
      }),
    ).toEqual(['gavioes', 'gavioes-pde-leste'])
  })

  it('unidade = torcida (Caso A): não duplica', () => {
    expect(
      slugsHierarquiaFixos({
        slugTorcida: 'gavioes',
        slugUnidade: 'gavioes',
        temTorcida: true,
        temUnidade: true,
      }),
    ).toEqual(['gavioes'])
  })
})

describe('ordem arrastável com hierarquia', () => {
  const fixos = ['sede', 'unidade']

  it('exclui fixos da zona móvel', () => {
    expect(ordemArrastavelSemFixos(['sede', 'unidade', 'a', 'b'], fixos)).toEqual([
      'a',
      'b',
    ])
  })

  it('drag só permuta extras; mantém prefixo hierárquico', () => {
    expect(moverSlugArrastavel(['sede', 'unidade', 'a', 'b'], 'b', 'a', fixos)).toEqual([
      'sede',
      'unidade',
      'b',
      'a',
    ])
  })

  it('não move fixo nem usa fixo como alvo', () => {
    expect(moverSlugArrastavel(['sede', 'a', 'b'], 'sede', 'a', ['sede'])).toEqual([
      'sede',
      'a',
      'b',
    ])
    expect(moverSlugArrastavel(['sede', 'a', 'b'], 'a', 'sede', ['sede'])).toEqual([
      'sede',
      'a',
      'b',
    ])
  })

  it('aplicarOrdemArrastavel reconstrói cookie com fixos no início', () => {
    expect(aplicarOrdemArrastavel(['sede', 'a', 'b'], ['b', 'a'], ['sede'])).toEqual([
      'sede',
      'b',
      'a',
    ])
    expect(aplicarOrdemArrastavel(['sede', 'a', 'b'], ['a'], ['sede'])).toBeNull()
  })

  it('fixo ausente do cookie não é inventado', () => {
    expect(aplicarOrdemArrastavel(['a', 'b'], ['b', 'a'], ['sede'])).toEqual(['b', 'a'])
  })
})
