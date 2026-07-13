import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { buildGoogleMapsUrl, buildStreetViewImageUrl, isGoogleMapsConfigured } from '@/lib/google-maps'

describe('google-maps', () => {
  const original = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

  beforeEach(() => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = 'test-key'
  })

  afterEach(() => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = original
  })

  it('detecta API key', () => {
    expect(isGoogleMapsConfigured()).toBe(true)
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
})
