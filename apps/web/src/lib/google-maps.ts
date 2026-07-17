/** Utilitários Google Maps (Street View / links / JS API). Degrada sem API key.
 *  Em produção a key precisa ter Maps JavaScript API + Street View Static + Geocoding.
 */

export function isGoogleMapsConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim())
}

export function getGoogleMapsApiKey(): string | null {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() || null
}

export type GoogleMapsRegion = {
  cidade: string
  estado: string
  lat: number
  lng: number
}

function queryLocal(sede: {
  endereco?: string | null
  cidade?: string | null
  estado?: string | null
  lat?: number | null
  lng?: number | null
}): string | null {
  if (sede.lat != null && sede.lng != null) {
    return `${sede.lat},${sede.lng}`
  }
  const partes = [sede.endereco, sede.cidade, sede.estado, 'Brasil'].filter(Boolean)
  if (partes.length <= 1) return null
  return partes.join(', ')
}

/** Query de endereço para geocode/Street View (sem preferir lat/lng já conhecidos). */
export function buildGeocodeQuery(sede: {
  endereco?: string | null
  cidade?: string | null
  estado?: string | null
}): string | null {
  const partes = [sede.endereco, sede.cidade, sede.estado, 'Brasil'].filter(Boolean)
  if (partes.length <= 1) return null
  return partes.join(', ')
}

/** Imagem estática Street View (fachada) quando há cobertura. */
export function buildStreetViewImageUrl(
  sede: {
    endereco?: string | null
    cidade?: string | null
    estado?: string | null
    lat?: number | null
    lng?: number | null
  },
  opts?: { width?: number; height?: number },
): string | null {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim()
  const location = queryLocal(sede)
  if (!key || !location) return null
  const w = opts?.width ?? 640
  const h = opts?.height ?? 280
  const params = new URLSearchParams({
    size: `${w}x${h}`,
    location,
    key,
    fov: '80',
    pitch: '0',
  })
  return `https://maps.googleapis.com/maps/api/streetview?${params.toString()}`
}

/** Abre o local no Google Maps (app/web). */
export function buildGoogleMapsUrl(sede: {
  endereco?: string | null
  cidade?: string | null
  estado?: string | null
  lat?: number | null
  lng?: number | null
  nome?: string
}): string | null {
  const q = queryLocal(sede) ?? sede.nome
  if (!q) return null
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
}

/** Abre rotas (“Como chegar”) no Google Maps. */
export function buildDirectionsUrl(sede: {
  endereco?: string | null
  cidade?: string | null
  estado?: string | null
  lat?: number | null
  lng?: number | null
  nome?: string
}): string | null {
  const dest = queryLocal(sede) ?? sede.nome
  if (!dest) return null
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`
}

/** Subconjunto tipado do Maps JS API usado pelo portal Sedes. */
export type GoogleMapsNamespace = {
  maps: {
    Map: new (
      el: HTMLElement,
      opts?: {
        center?: { lat: number; lng: number }
        zoom?: number
        disableDefaultUI?: boolean
        zoomControl?: boolean
        mapTypeControl?: boolean
        streetViewControl?: boolean
        fullscreenControl?: boolean
        gestureHandling?: 'cooperative' | 'greedy' | 'none' | 'auto'
        styles?: Array<Record<string, unknown>>
      },
    ) => GoogleMapInstance
    Marker: new (opts: {
      map?: GoogleMapInstance | null
      position: { lat: number; lng: number }
      title?: string
      zIndex?: number
      icon?: {
        path?: number | string
        scale?: number
        fillColor?: string
        fillOpacity?: number
        strokeColor?: string
        strokeWeight?: number
      }
    }) => GoogleMarkerInstance
    LatLngBounds: new () => GoogleLatLngBounds
    SymbolPath: { CIRCLE: number }
    event: {
      addListener: (instance: object, eventName: string, handler: () => void) => { remove: () => void }
      clearInstanceListeners: (instance: object) => void
    }
  }
}

export type GoogleMapPadding =
  | number
  | { top?: number; right?: number; bottom?: number; left?: number }

export type GoogleMapInstance = {
  fitBounds: (bounds: GoogleLatLngBounds, padding?: GoogleMapPadding) => void
  panTo: (latLng: { lat: number; lng: number }) => void
  setZoom: (zoom: number) => void
  getZoom: () => number | undefined
}

export type GoogleMarkerInstance = {
  setMap: (map: GoogleMapInstance | null) => void
  setIcon: (icon: object) => void
  setZIndex: (z: number) => void
  addListener: (eventName: string, handler: () => void) => { remove: () => void }
}

export type GoogleLatLngBounds = {
  extend: (latLng: { lat: number; lng: number }) => void
  isEmpty: () => boolean
}

declare global {
  // eslint-disable-next-line no-var
  var google: GoogleMapsNamespace | undefined
}

let mapsScriptPromise: Promise<GoogleMapsNamespace> | null = null

/** Carrega o Maps JavaScript API uma vez (singleton). */
export function loadGoogleMapsScript(): Promise<GoogleMapsNamespace> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Maps JS só no client'))
  }
  if (window.google?.maps?.Map) {
    return Promise.resolve(window.google)
  }
  if (mapsScriptPromise) return mapsScriptPromise

  const key = getGoogleMapsApiKey()
  if (!key) {
    return Promise.reject(new Error('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ausente'))
  }

  mapsScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-google-maps="js"]')
    if (existing) {
      existing.addEventListener('load', () => {
        if (window.google?.maps) resolve(window.google)
        else reject(new Error('Google Maps falhou ao carregar'))
      })
      existing.addEventListener('error', () => reject(new Error('Google Maps script error')))
      return
    }

    const script = document.createElement('script')
    script.dataset.googleMaps = 'js'
    script.async = true
    script.defer = true
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&language=pt-BR&region=BR`
    script.onload = () => {
      if (window.google?.maps) resolve(window.google)
      else reject(new Error('Google Maps falhou ao carregar'))
    }
    script.onerror = () => {
      mapsScriptPromise = null
      reject(new Error('Google Maps script error'))
    }
    document.head.appendChild(script)
  })

  return mapsScriptPromise
}

type GeocodeAddressComponent = {
  long_name: string
  short_name: string
  types: string[]
}

type GeocodeResult = {
  address_components?: GeocodeAddressComponent[]
  geometry?: { location?: { lat: number; lng: number } }
}

type GeocodeResponse = {
  status: string
  results?: GeocodeResult[]
}

function componente(
  componentes: GeocodeAddressComponent[],
  tipo: string,
  campo: 'long_name' | 'short_name' = 'long_name',
): string | null {
  return componentes.find((c) => c.types.includes(tipo))?.[campo] ?? null
}

/**
 * Resolve cidade/UF a partir da localização do navegador.
 * Útil para recomendar subsedes/PDEs por proximidade sem exigir digitação manual.
 */
export async function reverseGeocodeRegion(
  coords: { lat: number; lng: number },
): Promise<GoogleMapsRegion | null> {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim()
  if (!key) return null

  const params = new URLSearchParams({
    latlng: `${coords.lat},${coords.lng}`,
    key,
    language: 'pt-BR',
    region: 'br',
    result_type: 'locality|administrative_area_level_2|administrative_area_level_1',
  })
  const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`)
  if (!res.ok) return null

  const data = (await res.json()) as GeocodeResponse
  const componentes = data.results?.[0]?.address_components
  if (data.status !== 'OK' || !componentes) return null

  const cidade =
    componente(componentes, 'administrative_area_level_2') ??
    componente(componentes, 'locality') ??
    componente(componentes, 'sublocality') ??
    ''
  const estado = componente(componentes, 'administrative_area_level_1', 'short_name') ?? ''

  if (!cidade || !estado) return null
  return { cidade, estado, lat: coords.lat, lng: coords.lng }
}

/**
 * Resolve lat/lng a partir de cidade + UF (seleção manual no onboarding).
 * Necessário para recomendações por proximidade sem GPS do navegador.
 */
export async function forwardGeocodeRegion(
  cidade: string,
  estado: string,
): Promise<GoogleMapsRegion | null> {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim()
  const cidadeNorm = cidade.trim()
  const estadoNorm = estado.trim().toUpperCase()
  if (!key || !cidadeNorm || !estadoNorm) return null

  const params = new URLSearchParams({
    address: `${cidadeNorm}, ${estadoNorm}, Brasil`,
    key,
    language: 'pt-BR',
    region: 'br',
    components: `country:BR|administrative_area:${estadoNorm}`,
  })
  const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`)
  if (!res.ok) return null

  const data = (await res.json()) as GeocodeResponse
  const loc = data.results?.[0]?.geometry?.location
  if (data.status !== 'OK' || !loc) return null

  return { cidade: cidadeNorm, estado: estadoNorm, lat: loc.lat, lng: loc.lng }
}

const geocodeCache = new Map<string, Promise<{ lat: number; lng: number } | null>>()

/** Geocodifica um endereço livre (com cache em memória por query). */
export function geocodeLatLng(address: string): Promise<{ lat: number; lng: number } | null> {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim()
  const addressNorm = address.trim()
  if (!key || !addressNorm) return Promise.resolve(null)

  const cached = geocodeCache.get(addressNorm)
  if (cached) return cached

  const pending = (async () => {
    const params = new URLSearchParams({
      address: addressNorm,
      key,
      language: 'pt-BR',
      region: 'br',
    })
    const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`)
    if (!res.ok) return null
    const data = (await res.json()) as GeocodeResponse
    const loc = data.results?.[0]?.geometry?.location
    if (data.status !== 'OK' || !loc) return null
    return { lat: loc.lat, lng: loc.lng }
  })()

  geocodeCache.set(addressNorm, pending)
  return pending
}

/**
 * Preenche lat/lng ausentes a partir do endereço/cidade da unidade.
 * Necessário enquanto o banco ainda não tem coordenadas persistidas.
 */
export async function enrichSedesComCoordenadas<
  T extends {
    lat: number | null
    lng: number | null
    endereco?: string | null
    cidade?: string | null
    estado?: string | null
  },
>(sedes: T[]): Promise<T[]> {
  if (!isGoogleMapsConfigured()) return sedes

  const results: T[] = new Array(sedes.length)
  let cursor = 0
  const concurrency = Math.min(4, sedes.length)

  async function worker() {
    while (cursor < sedes.length) {
      const idx = cursor
      cursor += 1
      const sede = sedes[idx]!
      if (sede.lat != null && sede.lng != null) {
        results[idx] = sede
        continue
      }
      const query = buildGeocodeQuery(sede)
      if (!query) {
        results[idx] = sede
        continue
      }
      const coords = await geocodeLatLng(query)
      results[idx] = coords ? { ...sede, lat: coords.lat, lng: coords.lng } : sede
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  return results
}
