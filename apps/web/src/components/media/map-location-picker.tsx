'use client'

import { useEffect, useRef, useState } from 'react'
import { MapPin } from 'lucide-react'
import {
  getGoogleMapsMapId,
  isGoogleMapsConfigured,
  loadGoogleMapsMarkerLibrary,
  type GoogleMapInstance,
  type GoogleMarkerInstance,
  type GoogleMapsMarkerLibrary,
  type GoogleMapsNamespace,
} from '@/lib/google-maps'

type Props = {
  lat: number | null
  lng: number | null
  onPick: (coords: { lat: number; lng: number }) => void
  className?: string
}

const DEFAULT_CENTER = { lat: -23.55, lng: -46.63 }

type MapClickEvent = {
  latLng?: { lat: () => number; lng: () => number } | null
}

function readMarkerLatLng(
  position: GoogleMarkerInstance['position'],
): { lat: number; lng: number } | null {
  if (!position) return null
  const raw = position as { lat: number | (() => number); lng: number | (() => number) }
  const lat = typeof raw.lat === 'function' ? raw.lat() : raw.lat
  const lng = typeof raw.lng === 'function' ? raw.lng() : raw.lng
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

/**
 * Mapa de edição: clique ou arraste o pin para posicionar.
 */
export function MapLocationPicker({ lat, lng, onPick, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<GoogleMapInstance | null>(null)
  const markerRef = useRef<GoogleMarkerInstance | null>(null)
  const gRef = useRef<GoogleMapsNamespace | null>(null)
  const markerLibRef = useRef<GoogleMapsMarkerLibrary | null>(null)
  const onPickRef = useRef(onPick)
  const draggingRef = useRef(false)
  const [mapReady, setMapReady] = useState(false)
  const [mapLoading, setMapLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)

  onPickRef.current = onPick
  const configured = isGoogleMapsConfigured()
  const hasCoords = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)

  useEffect(() => {
    if (!configured || !containerRef.current) return
    let cancelled = false
    let clickListener: { remove: () => void } | null = null
    setMapLoading(true)

    async function init() {
      try {
        const { g, marker, Map } = await loadGoogleMapsMarkerLibrary()
        if (cancelled || !containerRef.current) return
        gRef.current = g
        markerLibRef.current = marker

        const center =
          lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)
            ? { lat, lng }
            : DEFAULT_CENTER

        const map = new Map(containerRef.current, {
          center,
          zoom: lat != null && lng != null ? 15 : 11,
          mapId: getGoogleMapsMapId(),
          disableDefaultUI: true,
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          gestureHandling: 'cooperative',
        })
        mapRef.current = map

        clickListener = g.maps.event.addListener(map, 'click', (...args: unknown[]) => {
          if (draggingRef.current) return
          const ev = args[0] as MapClickEvent | undefined
          const ll = ev?.latLng
          if (!ll) return
          onPickRef.current({ lat: ll.lat(), lng: ll.lng() })
        })

        setMapReady(true)
        setMapLoading(false)
      } catch {
        if (!cancelled) {
          setLoadFailed(true)
          setMapLoading(false)
        }
      }
    }

    void init()
    return () => {
      cancelled = true
      clickListener?.remove()
      if (markerRef.current) markerRef.current.map = null
      markerRef.current = null
      mapRef.current = null
      gRef.current = null
      markerLibRef.current = null
      setMapReady(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lat/lng sync below
  }, [configured])

  useEffect(() => {
    const map = mapRef.current
    const markerLib = markerLibRef.current
    if (!mapReady || !map || !markerLib) return
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      if (markerRef.current) {
        markerRef.current.map = null
        markerRef.current = null
      }
      return
    }

    const pos = { lat, lng }
    if (!markerRef.current) {
      const marker = new markerLib.AdvancedMarkerElement({
        map,
        position: pos,
        title: 'Arraste para ajustar o local',
        content: new markerLib.PinElement({
          background: 'rgb(16, 185, 129)',
          borderColor: '#ffffff',
          glyphColor: '#ffffff',
          scale: 1.2,
        }),
        zIndex: 10,
        gmpDraggable: true,
      })
      marker.gmpDraggable = true
      marker.addEventListener('dragstart', () => {
        draggingRef.current = true
      })
      marker.addEventListener('dragend', () => {
        const next = readMarkerLatLng(marker.position)
        draggingRef.current = false
        if (next) onPickRef.current(next)
      })
      markerRef.current = marker
    } else if (!draggingRef.current) {
      markerRef.current.position = pos
      markerRef.current.map = map
      markerRef.current.gmpDraggable = true
    }
    if (!draggingRef.current) {
      map.panTo(pos)
      const zoom = map.getZoom() ?? 12
      if (zoom < 14) map.setZoom(15)
    }
  }, [mapReady, lat, lng])

  if (!configured || loadFailed) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))] ${className ?? ''}`}
      >
        <MapPin className="h-6 w-6 opacity-50" />
        <p className="px-4 text-center text-sm">
          {loadFailed
            ? 'Não foi possível carregar o Google Maps'
            : 'Mapa indisponível — configure a chave do Google Maps'}
        </p>
      </div>
    )
  }

  return (
    <div className={`relative ${className ?? ''}`}>
      <div
        ref={containerRef}
        role="application"
        aria-label="Mapa para marcar a localização"
        className="h-full w-full overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]"
      />
      {mapLoading && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl bg-[rgb(var(--background-subtle))]/90 text-[rgb(var(--foreground-muted))]">
          <MapPin className="h-6 w-6 animate-pulse opacity-50" />
          <p className="px-4 text-center text-sm">Carregando mapa…</p>
        </div>
      )}
      {mapReady && !mapLoading && (
        <p className="pointer-events-none absolute bottom-2 left-2 right-2 rounded-lg bg-[rgb(var(--surface))]/90 px-2 py-1.5 text-center text-[11px] text-[rgb(var(--foreground-muted))] shadow-sm">
          {hasCoords
            ? 'Arraste o pin ou clique no mapa para ajustar'
            : 'Clique no mapa para marcar o local'}
        </p>
      )}
    </div>
  )
}
