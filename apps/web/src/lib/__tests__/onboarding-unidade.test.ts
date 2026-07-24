import { describe, expect, it } from 'vitest'
import {
  agruparSedesPorRegiao,
  formatarDistanciaKm,
  sedeCombinaRegiao,
} from '@/lib/onboarding-unidade'
import type { SedeOnboarding } from '@/lib/onboarding'

const base = {
  endereco: null,
  sedePaiId: null,
  lat: null,
  lng: null,
  fotoUrl: null,
  streetViewHeading: null,
  streetViewPitch: null,
  streetViewFov: null,
} satisfies Partial<SedeOnboarding>

const sedes: SedeOnboarding[] = [
  {
    id: '1',
    nome: 'Sede Nacional',
    tipo: 'SEDE',
    cidade: 'São Paulo',
    estado: 'SP',
    ...base,
    lat: -23.53,
    lng: -46.64,
  },
  {
    id: '2',
    nome: 'Zona Leste',
    tipo: 'PONTO_ENCONTRO',
    cidade: 'São Paulo',
    estado: 'SP',
    ...base,
    sedePaiId: '3',
    lat: -23.54,
    lng: -46.5,
  },
  {
    id: '3',
    nome: 'Grande SP',
    tipo: 'SUBSEDE',
    cidade: 'São Paulo',
    estado: 'SP',
    ...base,
    sedePaiId: '1',
    lat: -23.55,
    lng: -46.63,
  },
  {
    id: '4',
    nome: 'Interior',
    tipo: 'SUBSEDE',
    cidade: 'Campinas',
    estado: 'SP',
    ...base,
    sedePaiId: '1',
    lat: -22.91,
    lng: -47.06,
  },
  {
    id: '5',
    nome: 'Baixada Santista',
    tipo: 'SUBSEDE',
    cidade: 'Santos',
    estado: 'SP',
    ...base,
    sedePaiId: '1',
    lat: -23.96,
    lng: -46.33,
  },
]

describe('onboarding-unidade', () => {
  it('combina cidade e UF', () => {
    expect(sedeCombinaRegiao(sedes[1]!, 'SP', 'São Paulo')).toBe(true)
    expect(sedeCombinaRegiao(sedes[3]!, 'SP', 'São Paulo')).toBe(false)
  })

  it('sede principal primeiro e unidade da região como segunda (sem coordenadas)', () => {
    const semCoords = sedes.map((s) => ({ ...s, lat: null, lng: null }))
    const { recomendadas, outras } = agruparSedesPorRegiao(semCoords, 'SP', 'São Paulo')
    expect(recomendadas.map((s) => s.id)).toEqual(['1', '2'])
    expect(outras.map((s) => s.id)).toEqual(['5', '3', '4'])
  })

  it('Praia Grande: sede primeiro e Baixada Santista como segunda por proximidade', () => {
    // Praia Grande - SP
    const localizacao = { lat: -24.0058, lng: -46.4028 }
    const { recomendadas, outras } = agruparSedesPorRegiao(
      sedes,
      'SP',
      'Praia Grande',
      localizacao,
    )
    expect(recomendadas.map((s) => s.id)).toEqual(['1', '5'])
    expect(recomendadas[1]!.distanciaKm).toBeLessThan(30)
    expect(recomendadas[0]!.distanciaKm).not.toBeNull()
    expect(outras.every((s) => s.distanciaKm != null)).toBe(true)
    expect(outras[0]!.distanciaKm!).toBeLessThanOrEqual(outras[outras.length - 1]!.distanciaKm!)
  })

  it('formata distância em km', () => {
    expect(formatarDistanciaKm(8.42)).toMatch(/8[,.]4 km/)
    expect(formatarDistanciaKm(47.2)).toBe('47 km')
  })
})
