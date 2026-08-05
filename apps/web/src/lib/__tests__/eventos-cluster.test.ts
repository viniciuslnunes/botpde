import { describe, expect, it } from 'vitest'
import { agruparDiaOperacional, diasOperacionaisNaJanela } from '@torcida/types'
import { dayKeyInZone } from '@/lib/format-datetime'

describe('agruparDiaOperacional', () => {
  it('agrupa CARAVANA + GERAL + partida no mesmo dia SP', () => {
    const eventos = [
      {
        id: 'c1',
        dataIso: '2026-08-09T14:00:00.000Z', // domingo SP tarde
        tipo: 'CARAVANA',
        titulo: 'Caravana SP',
        href: '/admin/caravanas/c1',
        partidaId: 'p1',
      },
      {
        id: 'g1',
        dataIso: '2026-08-09T18:00:00.000Z',
        tipo: 'GERAL',
        titulo: 'Churrasco na sede',
        href: '/admin/eventos/g1',
      },
    ]
    const partidas = [
      {
        id: 'p1',
        dataIso: '2026-08-09T19:00:00.000Z',
        adversario: 'Palmeiras',
        mando: 'CASA',
      },
    ]
    const map = agruparDiaOperacional(eventos, partidas, dayKeyInZone)
    expect(map.size).toBe(1)
    const dia = [...map.values()][0]!
    expect(dia.eventos.map((e) => e.id)).toEqual(['c1', 'g1'])
    expect(dia.partida?.id).toBe('p1')
    expect(dia.partida?.adversario).toBe('Palmeiras')
    expect(dia.sugestoesVincular.map((e) => e.id)).toEqual(['g1'])
    expect(dia.grupos.some((g) => g.kind === 'partida')).toBe(true)
    expect(dia.grupos.some((g) => g.kind === 'orfaos')).toBe(true)
  })

  it('não mistura dias vizinhos', () => {
    const eventos = [
      {
        id: 'a',
        dataIso: '2026-08-08T15:00:00.000Z',
        tipo: 'ENSAIO',
        titulo: 'Ensaio',
        href: '/e/a',
      },
      {
        id: 'b',
        dataIso: '2026-08-09T15:00:00.000Z',
        tipo: 'CARAVANA',
        titulo: 'Caravana',
        href: '/e/b',
      },
    ]
    const map = agruparDiaOperacional(eventos, [], dayKeyInZone)
    expect(map.size).toBe(2)
    for (const dia of map.values()) {
      expect(dia.eventos).toHaveLength(1)
    }
  })

  it('agrupa por projetoId e serieId', () => {
    const eventos = [
      {
        id: '1',
        dataIso: '2026-08-10T12:00:00.000Z',
        tipo: 'GERAL',
        titulo: 'Ação',
        href: '/e/1',
        projetoId: 'proj-1',
      },
      {
        id: '2',
        dataIso: '2026-08-10T14:00:00.000Z',
        tipo: 'ENSAIO',
        titulo: 'Ensaio série',
        href: '/e/2',
        serieId: 'serie-1',
      },
    ]
    const dia = [...agruparDiaOperacional(eventos, [], dayKeyInZone).values()][0]!
    expect(dia.grupos.map((g) => g.kind).sort()).toEqual(['projeto', 'serie'])
    expect(dia.sugestoesVincular).toHaveLength(0)
  })

  it('diasOperacionaisNaJanela preenche dias vazios', () => {
    const map = agruparDiaOperacional([], [], dayKeyInZone)
    const keys = ['2026-7-10', '2026-7-11']
    const dias = diasOperacionaisNaJanela(map, keys)
    expect(dias).toHaveLength(2)
    expect(dias[0]!.eventos).toEqual([])
    expect(dias[0]!.partida).toBeNull()
  })
})
