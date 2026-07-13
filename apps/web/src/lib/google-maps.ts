/** Utilitários Google Maps (Street View / links). Degrada sem API key. */

export function isGoogleMapsConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim())
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

type GeocodeAddressComponent = {
  long_name: string
  short_name: string
  types: string[]
}

type GeocodeResult = {
  address_components?: GeocodeAddressComponent[]
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
