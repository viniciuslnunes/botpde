import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import {
  buildDirectionsUrl,
  buildGoogleMapsUrl,
  buildStreetViewImageUrl,
  getGoogleMapsMapId,
  isGoogleMapsConfigured,
} from '@/lib/google-maps'

describe('google-maps', () => {
  const originalKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  const originalMapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID

  beforeEach(() => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = 'test-key'
    delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID
  })

  afterEach(() => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = originalKey
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID = originalMapId
  })

  it('detecta API key', () => {
    expect(isGoogleMapsConfigured()).toBe(true)
  })

  it('usa DEMO_MAP_ID quando Map ID não está configurado', () => {
    expect(getGoogleMapsMapId()).toBe('DEMO_MAP_ID')
  })

  it('respeita NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID', () => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID = 'abc123'
    expect(getGoogleMapsMapId()).toBe('abc123')
  })

  it('monta URL Street View com endereço', () => {
    const url = buildStreetViewImageUrl({
      endereco: 'Rua Cristina Tomaz, 183',
      cidade: 'São Paulo',
      estado: 'SP',
    })
    expect(url).toContain('maps.googleapis.com/maps/api/streetview')
    expect(url).toContain('key=test-key')
  })

  it('monta link de busca no Google Maps', () => {
    const url = buildGoogleMapsUrl({
      endereco: 'Rua dos Coqueiros, 100',
      cidade: 'Santo André',
      estado: 'SP',
    })
    expect(url).toContain('google.com/maps/search')
  })

  it('monta link de rotas no Google Maps', () => {
    const url = buildDirectionsUrl({
      lat: -23.5,
      lng: -46.6,
      nome: 'Sede',
    })
    expect(url).toContain('google.com/maps/dir')
    expect(url).toContain(encodeURIComponent('-23.5,-46.6'))
  })
})
