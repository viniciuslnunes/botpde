/** Utilitários Google Maps (Street View / links). Degrada sem API key. */

export function isGoogleMapsConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim())
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
