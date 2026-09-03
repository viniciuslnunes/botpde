import { describe, expect, it } from 'vitest'
import {
  filtrarOpcoesBusca,
  mesclarUniversoBusca,
  resolverOpcoesVisiveis,
  type ReactiveSearchOption,
} from '@/lib/reactive-search'

const ITENS: ReactiveSearchOption[] = [
  { id: '1', label: 'Ensaio da Bateria', sublabel: 'Ensaio · 20:00', searchText: 'ensaio bateria' },
  { id: '2', label: 'Caravana SP', sublabel: 'Caravana · sábado', searchText: 'caravana sao paulo' },
  { id: '3', label: 'Reunião', sublabel: 'Sede', searchText: 'reuniao sede' },
]

describe('filtrarOpcoesBusca', () => {
  it('filtra por termo normalizado sem acento', () => {
    const res = filtrarOpcoesBusca(ITENS, 'bateria', 10)
    expect(res).toHaveLength(1)
    expect(res[0]?.id).toBe('1')
  })

  it('respeita teto de resultados', () => {
    expect(filtrarOpcoesBusca(ITENS, '', 2)).toHaveLength(2)
  })
})

describe('mesclarUniversoBusca', () => {
  it('deduplica por id mantendo ordem da semente', () => {
    const remoto = [
      { id: '2', label: 'Caravana SP (remoto)' },
      { id: '4', label: 'Novo' },
    ]
    const merged = mesclarUniversoBusca(ITENS, remoto)
    expect(merged.map((i) => i.id)).toEqual(['1', '2', '3', '4'])
    expect(merged.find((i) => i.id === '2')?.label).toBe('Caravana SP')
  })
})

describe('resolverOpcoesVisiveis', () => {
  it('calcula truncamento', () => {
    const { opcoes, truncado, totalOcultos } = resolverOpcoesVisiveis(ITENS, '', 2)
    expect(opcoes).toHaveLength(2)
    expect(truncado).toBe(true)
    expect(totalOcultos).toBe(1)
  })
})
