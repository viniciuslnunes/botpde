import { ExternalLink, MapPin } from 'lucide-react'
import { buildDirectionsUrl, buildGoogleMapsUrl } from '@/lib/google-maps'

function osmEmbedUrl(lat: number, lng: number) {
  const d = 0.012
  const bbox = `${lng - d},${lat - d},${lng + d},${lat + d}`
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat}%2C${lng}`
}

/** Mapa embutido (OSM) + links externos quando há coordenadas. */
export function EventoMapaLinks({
  lat,
  lng,
  local,
  embed = true,
}: {
  lat: number | null | undefined
  lng: number | null | undefined
  local?: string | null
  embed?: boolean
}) {
  if (lat == null || lng == null) return null

  const mapsUrl = buildGoogleMapsUrl({ lat, lng, nome: local ?? undefined })
  const directionsUrl = buildDirectionsUrl({ lat, lng, nome: local ?? undefined })
  if (!mapsUrl) return null

  return (
    <div className="space-y-3">
      {embed && (
        <div className="overflow-hidden rounded-xl border border-[rgb(var(--border))]">
          <iframe
            title={local ? `Mapa — ${local}` : 'Mapa do evento'}
            src={osmEmbedUrl(lat, lng)}
            className="h-48 w-full border-0 bg-[rgb(var(--background-subtle))] sm:h-56"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
        >
          <MapPin className="h-3.5 w-3.5" />
          Ver no mapa
          <ExternalLink className="h-3 w-3 opacity-70" />
        </a>
        {directionsUrl && (
          <a
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))] hover:underline"
          >
            Como chegar
            <ExternalLink className="h-3 w-3 opacity-70" />
          </a>
        )}
      </div>
    </div>
  )
}
