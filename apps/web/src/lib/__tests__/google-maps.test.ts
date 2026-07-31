import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  buildDirectionsUrl,
  buildGeocodeQuery,
  buildGoogleMapsUrl,
  buildStreetViewImageUrl,
  getGoogleMapsMapId,
  isGoogleMapsConfigured,
  isGoogleMapsShortUrl,
  isGoogleMapsUrl,
  parseCoordsFromGoogleMapsUrl,
  resolveSedeLocationImage,
  reverseGeocodeEndereco,
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
    expect(url).toContain('heading=180')
  })

  it('resolveSedeLocationImage usa ângulos salvos (não fotoUrl)', () => {
    const url = resolveSedeLocationImage(
      {
        lat: -23.5,
        lng: -46.6,
        streetViewHeading: 90,
        streetViewPitch: 5,
        streetViewFov: 70,
      },
      { width: 160, height: 120 },
    )
    expect(url).toContain('heading=90')
    expect(url).toContain('pitch=5')
    expect(url).toContain('fov=70')
  })

  it('resolveSedeLocationImage retorna null sem coords', () => {
    expect(
      resolveSedeLocationImage({
        endereco: 'Rua X',
        cidade: 'SP',
        estado: 'SP',
      }),
    ).toBeNull()
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

  it('reconhece links curtos do Maps', () => {
    expect(isGoogleMapsShortUrl('https://maps.app.goo.gl/abc123')).toBe(true)
    expect(isGoogleMapsShortUrl('https://www.google.com/maps/place/Foo')).toBe(false)
  })

  it('reconhece URLs longas do Maps', () => {
    expect(
      isGoogleMapsUrl(
        'https://www.google.com/maps/search/?api=1&query=-23.5195922,-46.6453042',
      ),
    ).toBe(true)
    expect(isGoogleMapsUrl('https://example.com/foo')).toBe(false)
  })

  it('inclui CEP na query de geocode', () => {
    const q = buildGeocodeQuery({
      endereco: 'Rua Aviador Bittencourt, 100',
      cidade: 'São Vicente',
      estado: 'SP',
      cep: '11370120',
    })
    expect(q).toContain('11370-120')
    expect(q).toContain('São Vicente')
  })

  it('extrai coords de URL completa do Maps', () => {
    expect(
      parseCoordsFromGoogleMapsUrl(
        'https://www.google.com/maps/place/Foo/@-23.895,-46.425,17z/data=!3d-23.8965!4d-46.4251',
      ),
    ).toEqual({ lat: -23.8965, lng: -46.4251 })

    expect(
      parseCoordsFromGoogleMapsUrl('https://www.google.com/maps?q=-23.5505,-46.6333'),
    ).toEqual({ lat: -23.5505, lng: -46.6333 })

    expect(parseCoordsFromGoogleMapsUrl('-23.55,-46.63')).toEqual({
      lat: -23.55,
      lng: -46.63,
    })
  })

  it('em permalink de Street View, prioriza a posição da câmera (mais precisa) sobre o pin do lugar', () => {
    // URL real de Street View: @lat,lng,3a,... é onde a foto foi tirada (em frente
    // à fachada); !3d!4d é o pin do cadastro comercial, que pode estar alguns
    // metros longe do endereço exato.
    const url =
      'https://www.google.com/maps/place/Gavi%C3%B5es+da+Fiel/@-23.5195922,-46.6453042,3a,75y,163.81h,99.18t/data=!3m7!1e1!3m5!1szJEtwFbfUm8ns8TccZxLAA!2e0!7i16384!8i8192!4m14!1m7!3m6!1s0x94ce587140f89c67:0x98746b746587c4bf!2sGavi%C3%B5es+da+Fiel!8m2!3d-23.5199093!4d-46.645141!16s%2Fg%2F121mvxc1'
    expect(parseCoordsFromGoogleMapsUrl(url)).toEqual({
      lat: -23.5195922,
      lng: -46.6453042,
    })
  })

  it('reverseGeocodeEndereco extrai rua+número, cidade, UF e CEP da resposta do Geocoding', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'OK',
        results: [
          {
            address_components: [
              { long_name: '183', short_name: '183', types: ['street_number'] },
              { long_name: 'Rua Cristina Tomás', short_name: 'R. Cristina Tomás', types: ['route'] },
              { long_name: 'São Paulo', short_name: 'São Paulo', types: ['administrative_area_level_2'] },
              { long_name: 'São Paulo', short_name: 'SP', types: ['administrative_area_level_1'] },
              { long_name: '05045-000', short_name: '05045-000', types: ['postal_code'] },
            ],
          },
        ],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const endereco = await reverseGeocodeEndereco({ lat: -23.5195922, lng: -46.6453042 })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('latlng=-23.5195922%2C-46.6453042')
    expect(endereco).toEqual({
      endereco: 'Rua Cristina Tomás, 183',
      logradouro: 'Rua Cristina Tomás',
      numero: '183',
      bairro: '',
      cidade: 'São Paulo',
      estado: 'SP',
      cep: '05045-000',
    })

    vi.unstubAllGlobals()
  })

  it('reverseGeocodeEndereco lê o bairro de sublocality_level_1 ou neighborhood', async () => {
    // O Geocoding do Google alterna entre os dois tipos no Brasil — o
    // formulário de endereço do onboarding depende do bairro estar preenchido.
    const respostaCom = (tipoBairro: string) => ({
      ok: true,
      json: async () => ({
        status: 'OK',
        results: [
          {
            address_components: [
              { long_name: '183', short_name: '183', types: ['street_number'] },
              { long_name: 'Rua Cristina Tomás', short_name: 'R. Cristina Tomás', types: ['route'] },
              { long_name: 'Pinheiros', short_name: 'Pinheiros', types: [tipoBairro, 'political'] },
              { long_name: 'São Paulo', short_name: 'São Paulo', types: ['administrative_area_level_2'] },
              { long_name: 'São Paulo', short_name: 'SP', types: ['administrative_area_level_1'] },
              { long_name: '05045-000', short_name: '05045-000', types: ['postal_code'] },
            ],
          },
        ],
      }),
    })

    for (const tipo of ['sublocality_level_1', 'neighborhood', 'sublocality']) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respostaCom(tipo)))
      const endereco = await reverseGeocodeEndereco({ lat: -23.51, lng: -46.64 })
      expect(endereco?.bairro).toBe('Pinheiros')
      expect(endereco?.logradouro).toBe('Rua Cristina Tomás')
      expect(endereco?.numero).toBe('183')
      vi.unstubAllGlobals()
    }
  })

  it('reverseGeocodeEndereco retorna null sem API key configurada', async () => {
    delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const endereco = await reverseGeocodeEndereco({ lat: -23.5195922, lng: -46.6453042 })

    expect(endereco).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()

    vi.unstubAllGlobals()
  })
})
