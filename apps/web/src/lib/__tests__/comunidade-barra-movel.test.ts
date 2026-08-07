import { describe, expect, it } from 'vitest'
import {
  chaveBarraOperador,
  chaveBarraTematico,
  moverChaveBarraMovel,
  parseChaveBarraMovel,
  reordenarBarraMovel,
  sincronizarOrdemBarraMovel,
} from '../comunidade-barra-movel'

describe('chaves barra móvel', () => {
  it('serializa e parseia operador / temático', () => {
    expect(parseChaveBarraMovel(chaveBarraOperador('gavioes'))).toEqual({
      kind: 'operador',
      id: 'gavioes',
    })
    expect(parseChaveBarraMovel(chaveBarraTematico('uuid-1'))).toEqual({
      kind: 'tematico',
      id: 'uuid-1',
    })
    expect(parseChaveBarraMovel('x:nope')).toBeNull()
  })
})

describe('sincronizarOrdemBarraMovel', () => {
  it('sem cookie: extras operador depois temáticos', () => {
    expect(
      sincronizarOrdemBarraMovel({
        salva: [],
        slugsOperador: ['a', 'b'],
        idsTematicos: ['t1', 't2'],
      }),
    ).toEqual(['o:a', 'o:b', 't:t1', 't:t2'])
  })

  it('preserva ordem salva e anexa novidades; remove órfãos', () => {
    expect(
      sincronizarOrdemBarraMovel({
        salva: ['t:t2', 'o:a', 'o:gone', 't:t1'],
        slugsOperador: ['a', 'b'],
        idsTematicos: ['t1', 't2'],
      }),
    ).toEqual(['t:t2', 'o:a', 't:t1', 'o:b'])
  })
})

describe('moverChaveBarraMovel', () => {
  it('move entre tipos na zona móvel', () => {
    expect(moverChaveBarraMovel(['o:a', 't:1', 'o:b'], 't:1', 'o:a')).toEqual([
      't:1',
      'o:a',
      'o:b',
    ])
    expect(moverChaveBarraMovel(['o:a', 't:1', 'o:b'], 'o:b', 'o:a')).toEqual([
      'o:b',
      'o:a',
      't:1',
    ])
  })
})

describe('reordenarBarraMovel', () => {
  it('aceita permutação e subconjunto', () => {
    expect(reordenarBarraMovel(['o:a', 't:1', 'o:b'], ['o:b', 't:1', 'o:a'])).toEqual([
      'o:b',
      't:1',
      'o:a',
    ])
    expect(reordenarBarraMovel(['o:a', 't:1', 'o:b'], ['t:1', 'o:a'])).toEqual([
      't:1',
      'o:a',
      'o:b',
    ])
    expect(reordenarBarraMovel(['o:a', 't:1'], ['o:a', 'o:a'])).toBeNull()
  })
})
