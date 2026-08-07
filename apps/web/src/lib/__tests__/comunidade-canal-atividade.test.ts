import { describe, expect, it } from 'vitest'
import {
  calcularUnreadKeys,
  chaveAtividadeCanal,
  chaveAtividadeNacional,
  marcarLastSeen,
  parseChaveAtividade,
  temAtividadeNova,
} from '../comunidade-canal-atividade'
import { montarAlvosAtividadeBarra } from '../use-comunidade-canal-atividade'

describe('chaves atividade barra', () => {
  it('serializa e parseia nacional / canal', () => {
    expect(parseChaveAtividade(chaveAtividadeNacional('aff-1'))).toEqual({
      kind: 'nacional',
      afiliacaoId: 'aff-1',
    })
    expect(parseChaveAtividade(chaveAtividadeCanal('c-1'))).toEqual({
      kind: 'canal',
      conversaId: 'c-1',
    })
    expect(parseChaveAtividade('x:nope')).toBeNull()
  })
})

describe('temAtividadeNova', () => {
  it('sem head → sem novidade', () => {
    expect(temAtividadeNova(null, null)).toBe(false)
    expect(temAtividadeNova(undefined, '2026-01-01T00:00:00.000Z')).toBe(false)
  })

  it('sem last-seen e com head → novidade', () => {
    expect(temAtividadeNova('2026-01-02T00:00:00.000Z', null)).toBe(true)
  })

  it('head mais novo que last-seen', () => {
    expect(
      temAtividadeNova('2026-01-03T00:00:00.000Z', '2026-01-02T00:00:00.000Z'),
    ).toBe(true)
    expect(
      temAtividadeNova('2026-01-02T00:00:00.000Z', '2026-01-02T00:00:00.000Z'),
    ).toBe(false)
    expect(
      temAtividadeNova('2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z'),
    ).toBe(false)
  })
})

describe('calcularUnreadKeys', () => {
  it('ignora a aba ativa e marca as demais com head mais novo', () => {
    const unread = calcularUnreadKeys({
      heads: {
        'canal:a': '2026-01-03T00:00:00.000Z',
        'canal:b': '2026-01-03T00:00:00.000Z',
        'nacional:aff': '2026-01-01T00:00:00.000Z',
      },
      lastSeen: {
        'canal:a': '2026-01-01T00:00:00.000Z',
        'canal:b': '2026-01-01T00:00:00.000Z',
        'nacional:aff': '2026-01-02T00:00:00.000Z',
      },
      activeKey: 'canal:a',
    })
    expect([...unread].sort()).toEqual(['canal:b'])
  })
})

describe('marcarLastSeen', () => {
  it('grava ISO na chave', () => {
    const next = marcarLastSeen({}, 'canal:x', '2026-01-05T00:00:00.000Z')
    expect(next['canal:x']).toBe('2026-01-05T00:00:00.000Z')
  })
})

describe('montarAlvosAtividadeBarra', () => {
  it('deduplica canalIds e inclui nacional', () => {
    const alvos = montarAlvosAtividadeBarra({
      afiliacaoId: 'aff-1',
      canalIds: ['c1', null, 'c1', 'c2', undefined],
    })
    expect(alvos).toEqual([
      { chave: 'nacional:aff-1', kind: 'nacional', afiliacaoId: 'aff-1' },
      { chave: 'canal:c1', kind: 'canal', conversaId: 'c1' },
      { chave: 'canal:c2', kind: 'canal', conversaId: 'c2' },
    ])
  })
})
