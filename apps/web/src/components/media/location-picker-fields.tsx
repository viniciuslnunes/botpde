'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { Crop, Crosshair, Link2, Loader2, MapPin, Search } from 'lucide-react'
import { FieldError, Input, toast } from '@torcida/ui'
import {
  buildGeocodeQuery,
  buildStreetViewImageUrl,
  geocodeLatLng,
  isGoogleMapsConfigured,
  parseCoordsFromGoogleMapsUrl,
} from '@/lib/google-maps'
import {
  obterStreetViewParaCrop,
  resolverCoordsDeLinkMaps,
} from '@/lib/maps-actions'
import { useCroppedImageUpload } from '@/components/media/use-cropped-image-upload'

const MapLocationPicker = dynamic(
  () =>
    import('@/components/media/map-location-picker').then((m) => m.MapLocationPicker),
  {
    ssr: false,
    loading: () => (
      <div className="h-52 w-full animate-pulse rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]" />
    ),
  },
)

type Props = {
  defaultLat?: number | null
  defaultLng?: number | null
  /** Endereço/cidade/UF já no form (para geocode) — lidos do FormData pelo formId. */
  formId?: string
  errorsLat?: string[]
  errorsLng?: string[]
  /** Quando true, mostra Street View ajustável + “Usar como foto”. */
  enableStreetViewPhoto?: boolean
  onStreetViewPhoto?: (url: string) => void
  onCoordsChange?: (coords: { lat: number; lng: number }) => void
  /** Se false, não renderiza inputs name=lat/lng (caller controla). Default true. */
  renderHiddenInputs?: boolean
  className?: string
}

/**
 * Localização reutilizável: link Maps, busca, pin arrastável, lat/lng.
 * Opcionalmente Street View → crop → callback de foto.
 */
export function LocationPickerFields({
  defaultLat,
  defaultLng,
  formId,
  errorsLat,
  errorsLng,
  enableStreetViewPhoto = false,
  onStreetViewPhoto,
  onCoordsChange,
  renderHiddenInputs = true,
  className,
}: Props) {
  const [lat, setLat] = useState(defaultLat != null ? String(defaultLat) : '')
  const [lng, setLng] = useState(defaultLng != null ? String(defaultLng) : '')
  const [mapsLink, setMapsLink] = useState('')
  const [mapSearch, setMapSearch] = useState('')
  const [geoStatus, setGeoStatus] = useState<'idle' | 'loading' | 'error' | 'ok'>('idle')
  const [linkStatus, setLinkStatus] = useState<'idle' | 'loading' | 'error' | 'ok'>('idle')
  const [searchStatus, setSearchStatus] = useState<'idle' | 'loading' | 'error' | 'ok'>('idle')
  const [svHeading, setSvHeading] = useState(0)
  const [svPitch, setSvPitch] = useState(0)
  const [svFov, setSvFov] = useState(80)
  const [svBusy, setSvBusy] = useState(false)
  const mapsConfigured = isGoogleMapsConfigured()

  const crop = useCroppedImageUpload({
    aspect: 16 / 9,
    purpose: 'sede',
    title: 'Ajustar Street View',
    onDone: ({ url }) => {
      if (url) onStreetViewPhoto?.(url)
    },
  })

  const latN = lat.trim() ? Number(lat) : null
  const lngN = lng.trim() ? Number(lng) : null
  const hasCoords =
    latN != null && lngN != null && Number.isFinite(latN) && Number.isFinite(lngN)

  const streetViewPreview =
    mapsConfigured && hasCoords
      ? buildStreetViewImageUrl(
          { lat: latN, lng: lngN },
          { width: 640, height: 360, heading: svHeading, pitch: svPitch, fov: svFov },
        )
      : null

  function aplicarCoords(coords: { lat: number; lng: number }, origem: 'geo' | 'link' | 'search' | 'map') {
    setLat(String(coords.lat))
    setLng(String(coords.lng))
    if (origem === 'geo') setGeoStatus('ok')
    if (origem === 'link') setLinkStatus('ok')
    if (origem === 'search') setSearchStatus('ok')
    onCoordsChange?.(coords)
    if (formId) {
      document.getElementById(formId)?.dispatchEvent(new Event('input', { bubbles: true }))
    }
  }

  async function geocodificar() {
    if (!formId) {
      setGeoStatus('error')
      return
    }
    const form = document.getElementById(formId) as HTMLFormElement | null
    if (!form) return
    const fd = new FormData(form)
    const query = buildGeocodeQuery({
      endereco: String(fd.get('endereco') ?? fd.get('local') ?? ''),
      cidade: String(fd.get('cidade') ?? ''),
      estado: String(fd.get('estado') ?? ''),
    })
    if (!query) {
      setGeoStatus('error')
      toast.error('Preencha endereço/local (e cidade/UF se houver) para geocodificar.')
      return
    }
    setGeoStatus('loading')
    const coords = await geocodeLatLng(query)
    if (!coords) {
      setGeoStatus('error')
      return
    }
    aplicarCoords(coords, 'geo')
  }

  async function aplicarLinkMaps() {
    const raw = mapsLink.trim()
    if (!raw) {
      setLinkStatus('error')
      return
    }
    const local = parseCoordsFromGoogleMapsUrl(raw)
    if (local) {
      aplicarCoords(local, 'link')
      return
    }
    setLinkStatus('loading')
    const result = await resolverCoordsDeLinkMaps(raw)
    if (!result.ok) {
      setLinkStatus('error')
      toast.error(result.message)
      return
    }
    aplicarCoords({ lat: result.lat, lng: result.lng }, 'link')
  }

  async function buscarNoMapa() {
    const q = mapSearch.trim()
    if (!q) {
      setSearchStatus('error')
      return
    }
    setSearchStatus('loading')
    const coords = await geocodeLatLng(q.includes('Brasil') ? q : `${q}, Brasil`)
    if (!coords) {
      setSearchStatus('error')
      toast.error('Não encontramos esse local. Tente outro termo ou um link do Maps.')
      return
    }
    aplicarCoords(coords, 'search')
  }

  async function usarStreetViewComoFoto() {
    if (!hasCoords || latN == null || lngN == null) {
      toast.error('Defina a localização no mapa antes de usar o Street View.')
      return
    }
    setSvBusy(true)
    try {
      const result = await obterStreetViewParaCrop({
        lat: latN,
        lng: lngN,
        heading: svHeading,
        pitch: svPitch,
        fov: svFov,
      })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      crop.openFromSrc(result.dataUrl)
    } finally {
      setSvBusy(false)
    }
  }

  return (
    <div className={['space-y-3', className].filter(Boolean).join(' ')}>
      {crop.dialog}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          <MapPin className="h-3.5 w-3.5" />
          Localização no mapa
        </h3>
        {mapsConfigured && formId && (
          <button
            type="button"
            onClick={() => void geocodificar()}
            disabled={geoStatus === 'loading'}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-2.5 py-1 text-xs font-medium text-[rgb(var(--foreground))] transition-colors hover:border-[rgb(var(--color-primary))]/50 disabled:opacity-60"
          >
            {geoStatus === 'loading' ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Crosshair className="h-3 w-3" />
            )}
            Geocodificar endereço
          </button>
        )}
      </div>

      <div className="space-y-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]/40 p-3">
        <p className="text-[11px] text-[rgb(var(--foreground-muted))]">
          Cole um link do Google Maps, busque o local, clique ou arraste o pin.
        </p>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
              Link do Google Maps
            </label>
            <Input
              type="url"
              value={mapsLink}
              onChange={(e) => {
                setMapsLink(e.target.value)
                setLinkStatus('idle')
              }}
              placeholder="https://maps.app.goo.gl/… ou maps.google.com/…"
            />
          </div>
          <button
            type="button"
            onClick={() => void aplicarLinkMaps()}
            disabled={linkStatus === 'loading' || !mapsLink.trim()}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-xs font-medium text-[rgb(var(--foreground))] hover:border-[rgb(var(--color-primary))]/50 disabled:opacity-60"
          >
            {linkStatus === 'loading' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Link2 className="h-3.5 w-3.5" />
            )}
            Aplicar link
          </button>
        </div>

        {mapsConfigured && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
                Buscar no mapa
              </label>
              <Input
                type="search"
                value={mapSearch}
                onChange={(e) => {
                  setMapSearch(e.target.value)
                  setSearchStatus('idle')
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void buscarNoMapa()
                  }
                }}
                placeholder="Ex: Neo Química Arena, São Paulo"
              />
            </div>
            <button
              type="button"
              onClick={() => void buscarNoMapa()}
              disabled={searchStatus === 'loading' || !mapSearch.trim()}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-xs font-medium text-[rgb(var(--foreground))] hover:border-[rgb(var(--color-primary))]/50 disabled:opacity-60"
            >
              {searchStatus === 'loading' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Search className="h-3.5 w-3.5" />
              )}
              Buscar
            </button>
          </div>
        )}

        {(linkStatus === 'ok' || searchStatus === 'ok' || geoStatus === 'ok') && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            Coordenadas atualizadas.
          </p>
        )}
        {geoStatus === 'error' && (
          <p className="text-xs text-red-500" role="alert">
            Não foi possível geocodificar. Use o link do Maps, a busca ou lat/lng.
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Latitude
          </label>
          <Input
            name={renderHiddenInputs ? 'lat' : undefined}
            type="text"
            inputMode="decimal"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            placeholder="-23.5505"
          />
          <FieldError errors={errorsLat} />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Longitude
          </label>
          <Input
            name={renderHiddenInputs ? 'lng' : undefined}
            type="text"
            inputMode="decimal"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
            placeholder="-46.6333"
          />
          <FieldError errors={errorsLng} />
        </div>
      </div>

      {mapsConfigured && (
        <MapLocationPicker
          lat={hasCoords ? latN : null}
          lng={hasCoords ? lngN : null}
          onPick={(coords) => aplicarCoords(coords, 'map')}
          className="h-52 w-full"
        />
      )}

      {enableStreetViewPhoto && mapsConfigured && hasCoords && streetViewPreview && (
        <div className="space-y-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]/40 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-[rgb(var(--foreground))]">
              Ajustar Street View
            </p>
            {onStreetViewPhoto && (
              <button
                type="button"
                disabled={svBusy || crop.busy}
                onClick={() => void usarStreetViewComoFoto()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-2.5 py-1.5 text-xs font-medium text-[rgb(var(--foreground))] hover:border-[rgb(var(--color-primary))]/50 disabled:opacity-50"
              >
                {svBusy || crop.busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Crop className="h-3.5 w-3.5" />
                )}
                Usar como foto
              </button>
            )}
          </div>
          <div className="relative aspect-[16/9] overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]">
            <Image
              src={streetViewPreview}
              alt="Prévia Street View"
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 40vw"
              unoptimized
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-[11px] text-[rgb(var(--foreground-muted))]">
              Direção ({svHeading}°)
              <input
                type="range"
                min={0}
                max={359}
                value={svHeading}
                onChange={(e) => setSvHeading(Number(e.target.value))}
                className="mt-1 w-full accent-[rgb(var(--primary))]"
              />
            </label>
            <label className="block text-[11px] text-[rgb(var(--foreground-muted))]">
              Inclinação ({svPitch}°)
              <input
                type="range"
                min={-45}
                max={45}
                value={svPitch}
                onChange={(e) => setSvPitch(Number(e.target.value))}
                className="mt-1 w-full accent-[rgb(var(--primary))]"
              />
            </label>
            <label className="block text-[11px] text-[rgb(var(--foreground-muted))]">
              Zoom ({svFov}° FOV)
              <input
                type="range"
                min={30}
                max={100}
                value={svFov}
                onChange={(e) => setSvFov(Number(e.target.value))}
                className="mt-1 w-full accent-[rgb(var(--primary))]"
              />
            </label>
          </div>
        </div>
      )}
    </div>
  )
}
