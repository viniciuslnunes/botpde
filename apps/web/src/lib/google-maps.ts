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

function coordsValidas(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
}

/** Link curto do Maps que precisa de redirect para expor lat/lng na URL final. */
export function isGoogleMapsShortUrl(raw: string): boolean {
  try {
    const host = new URL(raw.trim()).hostname.toLowerCase()
    return (
      host === 'maps.app.goo.gl' ||
      host === 'goo.gl' ||
      host === 'g.co' ||
      host.endsWith('.app.goo.gl')
    )
  } catch {
    return false
  }
}

/**
 * Extrai lat/lng de URL completa do Google Maps, ou de "lat,lng" puro.
 * Prioridade: câmera do Street View (`@lat,lng,3a,...`, a posição real de onde a
 * foto foi tirada) > `!3d!4d` (pin do lugar — cadastro comercial, pode estar
 * alguns metros longe da fachada) > `@lat,lng` genérico (centro do viewport).
 */
export function parseCoordsFromGoogleMapsUrl(
  raw: string,
): { lat: number; lng: number } | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  const bare = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/)
  if (bare) {
    const lat = Number(bare[1])
    const lng = Number(bare[2])
    if (coordsValidas(lat, lng)) return { lat, lng }
  }

  // Permalink de Street View: @LAT,LNG,3a,FOVy,HEADINGh,PITCHt — LAT/LNG é onde a
  // câmera estava, ou seja, o ponto exato em frente ao que aparece na foto.
  const streetView = trimmed.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),3a,/)
  if (streetView) {
    const lat = Number(streetView[1])
    const lng = Number(streetView[2])
    if (coordsValidas(lat, lng)) return { lat, lng }
  }

  // !3dLAT!4dLNG — coordenada do lugar (antes de validar URL, cobre query encoded)
  const bang = trimmed.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/)
  if (bang) {
    const lat = Number(bang[1])
    const lng = Number(bang[2])
    if (coordsValidas(lat, lng)) return { lat, lng }
  }

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }

  const at = `${url.pathname}${url.search}${url.hash}`.match(
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
  )
  if (at) {
    const lat = Number(at[1])
    const lng = Number(at[2])
    if (coordsValidas(lat, lng)) return { lat, lng }
  }

  for (const key of ['q', 'query', 'll', 'center', 'destination']) {
    const v = url.searchParams.get(key)
    if (!v) continue
    const m = decodeURIComponent(v).match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/)
    if (!m) continue
    const lat = Number(m[1])
    const lng = Number(m[2])
    if (coordsValidas(lat, lng)) return { lat, lng }
  }

  return null
}

/**
 * Segue redirects de links curtos (`maps.app.goo.gl`, etc.) e devolve a URL final.
 * Só faz sentido no servidor (CORS no browser).
 */
export async function expandGoogleMapsShortUrl(raw: string): Promise<string | null> {
  const trimmed = raw.trim()
  if (!trimmed || !isGoogleMapsShortUrl(trimmed)) return null
  try {
    const res = await fetch(trimmed, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TorcidaSaaS/1.0)',
        Accept: 'text/html',
      },
    })
    return res.url?.trim() || null
  } catch {
    return null
  }
}

/** Resolve coordenadas a partir de link (curto ou completo) do Google Maps. */
export async function resolveCoordsFromGoogleMapsLink(
  raw: string,
): Promise<{ lat: number; lng: number } | null> {
  const direct = parseCoordsFromGoogleMapsUrl(raw)
  if (direct) return direct
  const expanded = await expandGoogleMapsShortUrl(raw)
  if (!expanded) return null
  return parseCoordsFromGoogleMapsUrl(expanded)
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
  opts?: {
    width?: number
    height?: number
    heading?: number
    pitch?: number
    fov?: number
  },
): string | null {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim()
  const location = queryLocal(sede)
  if (!key || !location) return null
  // Street View Static API: máximo 640×640.
  const w = Math.min(opts?.width ?? 640, 640)
  const h = Math.min(opts?.height ?? 280, 640)
  const heading = opts?.heading ?? 0
  const pitch = opts?.pitch ?? 0
  const fov = opts?.fov ?? 80
  const params = new URLSearchParams({
    size: `${w}x${h}`,
    location,
    key,
    fov: String(Math.min(120, Math.max(10, fov))),
    pitch: String(Math.min(90, Math.max(-90, pitch))),
    heading: String(((heading % 360) + 360) % 360),
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

/** Map ID cloud (Advanced Markers). `DEMO_MAP_ID` é oficial da Google p/ dev/prod sem estilo custom. */
export function getGoogleMapsMapId(): string {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID?.trim() || 'DEMO_MAP_ID'
}

/** Subconjunto tipado do Maps JS API usado pelo portal Sedes. */
export type GoogleMapsNamespace = {
  maps: {
    importLibrary: (name: 'maps' | 'marker') => Promise<Record<string, unknown>>
    Map: new (
      el: HTMLElement,
      opts?: {
        center?: { lat: number; lng: number }
        zoom?: number
        mapId?: string
        disableDefaultUI?: boolean
        zoomControl?: boolean
        mapTypeControl?: boolean
        streetViewControl?: boolean
        fullscreenControl?: boolean
        gestureHandling?: 'cooperative' | 'greedy' | 'none' | 'auto'
      },
    ) => GoogleMapInstance
    LatLngBounds: new () => GoogleLatLngBounds
    event: {
      addListener: (
        instance: object,
        eventName: string,
        handler: (...args: unknown[]) => void,
      ) => { remove: () => void }
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

/** AdvancedMarkerElement (substitui Marker depreciado). */
export type GoogleMarkerInstance = {
  map: GoogleMapInstance | null
  position: { lat: number; lng: number } | null
  content: HTMLElement | null
  zIndex: number | null
  title: string
  gmpDraggable?: boolean
  addEventListener: (type: string, listener: (...args: unknown[]) => void) => void
}

/** PinElement estende HTMLElement; a API antiga expunha `.element` (deprecated). */
export type GooglePinElement = HTMLElement

export type GoogleMapsMarkerLibrary = {
  AdvancedMarkerElement: new (opts: {
    map?: GoogleMapInstance | null
    position: { lat: number; lng: number }
    title?: string
    zIndex?: number
    content?: HTMLElement
    gmpDraggable?: boolean
  }) => GoogleMarkerInstance
  PinElement: new (opts: {
    background?: string
    borderColor?: string
    glyphColor?: string
    scale?: number
  }) => GooglePinElement
}

export type GoogleLatLngBounds = {
  extend: (latLng: { lat: number; lng: number }) => void
  isEmpty: () => boolean
}

declare global {
  // eslint-disable-next-line no-var
  var google: GoogleMapsNamespace | undefined
}

let mapsBootstrapInstalled = false
let mapsReadyPromise: Promise<GoogleMapsNamespace> | null = null
let markerLibraryPromise: Promise<GoogleMapsMarkerLibrary> | null = null

type BootstrapMaps = {
  importLibrary?: GoogleMapsNamespace['maps']['importLibrary']
  /** Callback interno do bootstrap oficial (`google.maps.__ib__`). */
  __ib__?: () => void
}

/**
 * Bootstrap oficial da Google (dynamic library import).
 * Instala `google.maps.importLibrary` na hora; o script real só baixa na 1ª chamada.
 * Não usar `script.onload` com `loading=async` — a API não fica pronta nesse evento.
 * @see https://developers.google.com/maps/documentation/javascript/load-maps-js-api
 */
function installGoogleMapsBootstrap(key: string): void {
  if (mapsBootstrapInstalled || typeof window.google?.maps?.importLibrary === 'function') {
    mapsBootstrapInstalled = true
    return
  }

  const gWindow = window as Window & { google?: { maps?: BootstrapMaps } }
  gWindow.google = gWindow.google ?? {}
  const mapsNs: BootstrapMaps = gWindow.google.maps ?? {}
  gWindow.google.maps = mapsNs

  const pendingLibraries = new Set<string>()
  let scriptPromise: Promise<void> | null = null

  const loadScript = (): Promise<void> => {
    if (scriptPromise) return scriptPromise

    // Microtask: deixa chamadas concorrentes de importLibrary enfileirarem libs no Set
    // antes de montar a URL (mesmo truque do bootstrap minificado da Google).
    scriptPromise = Promise.resolve().then(
      () =>
        new Promise<void>((resolve, reject) => {
          const params = new URLSearchParams()
          params.set('key', key)
          params.set('v', 'weekly')
          params.set('language', 'pt-BR')
          params.set('region', 'BR')
          params.set('loading', 'async')
          params.set('libraries', [...pendingLibraries].join(','))
          params.set('callback', 'google.maps.__ib__')

          mapsNs.__ib__ = () => resolve()

          const script = document.createElement('script')
          script.dataset.googleMaps = 'js'
          script.async = true
          script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`
          script.onerror = () => {
            scriptPromise = null
            mapsBootstrapInstalled = false
            reject(new Error('Google Maps script error'))
          }
          document.head.appendChild(script)
        }),
    )

    return scriptPromise
  }

  const stubImportLibrary: GoogleMapsNamespace['maps']['importLibrary'] = (name) => {
    pendingLibraries.add(name)
    return loadScript().then(() => {
      const real = mapsNs.importLibrary
      if (!real || real === stubImportLibrary) {
        throw new Error('Google Maps falhou ao carregar')
      }
      return real(name)
    })
  }

  mapsNs.importLibrary = stubImportLibrary
  mapsBootstrapInstalled = true
}

/** Garante bootstrap + hidrata `google.maps` via `importLibrary('maps')`. */
export function loadGoogleMapsScript(): Promise<GoogleMapsNamespace> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Maps JS só no client'))
  }

  if (mapsReadyPromise) return mapsReadyPromise

  const key = getGoogleMapsApiKey()
  if (!key) {
    return Promise.reject(new Error('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ausente'))
  }

  mapsReadyPromise = (async () => {
    installGoogleMapsBootstrap(key)
    const g = window.google
    if (!g?.maps?.importLibrary) {
      throw new Error('Google Maps falhou ao carregar')
    }
    await g.maps.importLibrary('maps')
    return g
  })().catch((err: unknown) => {
    mapsReadyPromise = null
    markerLibraryPromise = null
    throw err
  })

  return mapsReadyPromise
}

/** Biblioteca `marker` (AdvancedMarkerElement + PinElement) + Map hidratado. */
export async function loadGoogleMapsMarkerLibrary(): Promise<{
  g: GoogleMapsNamespace
  marker: GoogleMapsMarkerLibrary
  Map: GoogleMapsNamespace['maps']['Map']
}> {
  if (typeof window === 'undefined') {
    throw new Error('Maps JS só no client')
  }

  const key = getGoogleMapsApiKey()
  if (!key) {
    throw new Error('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ausente')
  }

  // Pedir maps+marker juntos para o bootstrap incluir ambos em `libraries=` na URL.
  installGoogleMapsBootstrap(key)
  const g = window.google
  if (!g?.maps?.importLibrary) {
    throw new Error('Google Maps falhou ao carregar')
  }

  if (!mapsReadyPromise) {
    mapsReadyPromise = g.maps
      .importLibrary('maps')
      .then(() => g)
      .catch((err: unknown) => {
        mapsReadyPromise = null
        markerLibraryPromise = null
        throw err
      })
  }

  if (!markerLibraryPromise) {
    markerLibraryPromise = g.maps
      .importLibrary('marker')
      .then((lib) => {
        const marker = lib as unknown as GoogleMapsMarkerLibrary
        if (!marker.AdvancedMarkerElement || !marker.PinElement) {
          throw new Error('Biblioteca marker incompleta')
        }
        return marker
      })
      .catch((err: unknown) => {
        markerLibraryPromise = null
        throw err
      })
  }

  const [, marker] = await Promise.all([mapsReadyPromise, markerLibraryPromise])
  if (!g.maps.Map) {
    throw new Error('google.maps.Map indisponível')
  }
  return { g, marker, Map: g.maps.Map }
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

export type GoogleMapsEnderecoReverso = {
  endereco: string
  cidade: string
  estado: string
  cep: string
}

/**
 * Resolve endereço completo (rua+número, cidade, UF, CEP) a partir de lat/lng.
 * Usado para preencher os campos de endereço ao colar um link do Maps/arrastar o pin.
 */
export async function reverseGeocodeEndereco(
  coords: { lat: number; lng: number },
): Promise<GoogleMapsEnderecoReverso | null> {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim()
  if (!key) return null

  const params = new URLSearchParams({
    latlng: `${coords.lat},${coords.lng}`,
    key,
    language: 'pt-BR',
    region: 'br',
  })
  const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`)
  if (!res.ok) return null

  const data = (await res.json()) as GeocodeResponse
  const componentes = data.results?.[0]?.address_components
  if (data.status !== 'OK' || !componentes) return null

  const rua = componente(componentes, 'route') ?? ''
  const numero = componente(componentes, 'street_number') ?? ''
  const cidade =
    componente(componentes, 'administrative_area_level_2') ??
    componente(componentes, 'locality') ??
    componente(componentes, 'sublocality') ??
    ''
  const estado = componente(componentes, 'administrative_area_level_1', 'short_name') ?? ''
  const cep = componente(componentes, 'postal_code') ?? ''

  if (!rua && !cidade) return null
  return {
    endereco: [rua, numero].filter(Boolean).join(', '),
    cidade,
    estado,
    cep,
  }
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
