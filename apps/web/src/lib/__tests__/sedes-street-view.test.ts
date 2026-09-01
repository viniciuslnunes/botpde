import { describe, expect, it } from 'vitest'
import { resolverSedeStreetView } from '@/lib/sedes-street-view'

function sede(id: string, coords: { lat: number; lng: number } | null) {
  return { id, lat: coords?.lat ?? null, lng: coords?.lng ?? null }
}

describe('resolverSedeStreetView', () => {
  it('usa a sede selecionada quando ela tem coordenadas', () => {
    const selected = sede('a', { lat: -23.5, lng: -46.6 })
    const other = sede('b', { lat: -23.6, lng: -46.7 })
    expect(resolverSedeStreetView(selected, [selected, other])).toBe(selected)
  })

  it('ignora seleção sem coordenadas', () => {
    const selected = sede('a', null)
    const only = sede('b', { lat: -23.5, lng: -46.6 })
    expect(resolverSedeStreetView(selected, [selected, only])).toBe(only)
  })

  it('sem seleção, assume o único local com coordenadas', () => {
    const sem = sede('a', null)
    const com = sede('b', { lat: -23.5, lng: -46.6 })
    expect(resolverSedeStreetView(null, [sem, com])).toBe(com)
  })

  it('sem seleção e com vários pins, não escolhe sozinho', () => {
    const a = sede('a', { lat: -23.5, lng: -46.6 })
    const b = sede('b', { lat: -23.6, lng: -46.7 })
    expect(resolverSedeStreetView(null, [a, b])).toBeNull()
  })

  it('devolve null quando ninguém tem coordenadas', () => {
    expect(resolverSedeStreetView(null, [sede('a', null)])).toBeNull()
  })
})
