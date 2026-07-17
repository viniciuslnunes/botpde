'use client'

import { useEffect, useRef, useState } from 'react'
import { MapPin } from 'lucide-react'
import {
  isGoogleMapsConfigured,
  loadGoogleMapsScript,
  type GoogleMapInstance,
  type GoogleMarkerInstance,
  type GoogleMapsNamespace,
} from '@/lib/google-maps'
import type { SedeExplorerItem } from '@/components/portal/sede-explorer-types'

type MapPoint = Pick<SedeExplorerItem, 'id' | 'nome' | 'lat' | 'lng'>

type Props = {
  sedes: MapPoint[]
  selectedId: string | null
  onSelect: (id: string) => void
  /** Posição do usuário — pin azul “você está aqui”. */
  userLocation?: { lat: number; lng: number } | null
  className?: string
}

const DEFAULT_CENTER = { lat: -23.55, lng: -46.63 }

function markerIcon(
  g: GoogleMapsNamespace,
  selected: boolean,
): {
  path: number
  scale: number
  fillColor: string
  fillOpacity: number
  strokeColor: string
  strokeWeight: number
} {
  return {
    path: g.maps.SymbolPath.CIRCLE,
    scale: selected ? 11 : 8,
    fillColor: selected ? 'rgb(124, 58, 237)' : 'rgb(99, 102, 241)',
    fillOpacity: 1,
    strokeColor: '#ffffff',
    strokeWeight: selected ? 2.5 : 1.5,
  }
}

function userLocationIcon(g: GoogleMapsNamespace): {
  path: number
  scale: number
  fillColor: string
  fillOpacity: number
  strokeColor: string
  strokeWeight: number
} {
  return {
    path: g.maps.SymbolPath.CIRCLE,
    scale: 9,
    fillColor: '#2563eb',
    fillOpacity: 1,
    strokeColor: '#ffffff',
    strokeWeight: 2.5,
  }
}

export function SedesMap({
  sedes,
  selectedId,
  onSelect,
  userLocation = null,
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<GoogleMapInstance | null>(null)
  const markersRef = useRef<Map<string, GoogleMarkerInstance>>(new Map())
  const userMarkerRef = useRef<GoogleMarkerInstance | null>(null)
  const gRef = useRef<GoogleMapsNamespace | null>(null)
  const onSelectRef = useRef(onSelect)
  const fittedKeyRef = useRef<string>('')
  const selectedIdRef = useRef(selectedId)
  const sedesRef = useRef(sedes)
  const prevSelectedRef = useRef<string | null>(selectedId)
  const [mapReady, setMapReady] = useState(false)
  const [mapLoading, setMapLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)

  onSelectRef.current = onSelect
  selectedIdRef.current = selectedId
  sedesRef.current = sedes

  const configured = isGoogleMapsConfigured()
  const withCoords = sedes.filter((s) => s.lat != null && s.lng != null)
  const coordsKey = withCoords.map((s) => `${s.id}:${s.lat},${s.lng}`).join('|')

  useEffect(() => {
    if (!configured || !containerRef.current) return
    let cancelled = false
    setMapLoading(true)

    async function init() {
      try {
        const g = await loadGoogleMapsScript()
        if (cancelled || !containerRef.current) return
        gRef.current = g

        const map = new g.maps.Map(containerRef.current, {
          center: DEFAULT_CENTER,
          zoom: 11,
          disableDefaultUI: true,
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          // Mobile: exige dois dedos / Ctrl+scroll — não “prende” o scroll da página
          gestureHandling: 'cooperative',
        })
        mapRef.current = map
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
      for (const marker of markersRef.current.values()) {
        marker.setMap(null)
      }
      markersRef.current.clear()
      userMarkerRef.current?.setMap(null)
      userMarkerRef.current = null
      mapRef.current = null
      gRef.current = null
      setMapReady(false)
    }
  }, [configured])

  // Sync markers quando o conjunto de coordenadas muda
  useEffect(() => {
    const map = mapRef.current
    const g = gRef.current
    if (!mapReady || !map || !g) return

    const points = sedes.filter((s) => s.lat != null && s.lng != null)
    const alive = new Set(points.map((s) => s.id))
    const selected = selectedIdRef.current

    for (const [id, marker] of markersRef.current) {
      if (!alive.has(id)) {
        marker.setMap(null)
        markersRef.current.delete(id)
      }
    }

    for (const sede of points) {
      const pos = { lat: sede.lat!, lng: sede.lng! }
      let marker = markersRef.current.get(sede.id)
      if (!marker) {
        marker = new g.maps.Marker({
          map,
          position: pos,
          title: sede.nome,
          icon: markerIcon(g, sede.id === selected),
          zIndex: sede.id === selected ? 10 : 1,
        })
        marker.addListener('click', () => onSelectRef.current(sede.id))
        markersRef.current.set(sede.id, marker)
      }
    }

    if (points.length === 0) return
    if (fittedKeyRef.current === coordsKey) return
    fittedKeyRef.current = coordsKey

    if (points.length === 1) {
      map.panTo({ lat: points[0]!.lat!, lng: points[0]!.lng! })
      map.setZoom(14)
      return
    }

    const bounds = new g.maps.LatLngBounds()
    for (const s of points) {
      bounds.extend({ lat: s.lat!, lng: s.lng! })
    }
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, 48)
    }
  }, [mapReady, sedes, coordsKey])

  // Só atualiza ícone do pin anterior + selecionado
  useEffect(() => {
    const g = gRef.current
    const map = mapRef.current
    if (!mapReady || !g || !map) return

    const prev = prevSelectedRef.current
    if (prev && prev !== selectedId) {
      const prevMarker = markersRef.current.get(prev)
      if (prevMarker) {
        prevMarker.setIcon(markerIcon(g, false))
        prevMarker.setZIndex(1)
      }
    }
    if (selectedId) {
      const marker = markersRef.current.get(selectedId)
      if (marker) {
        marker.setIcon(markerIcon(g, true))
        marker.setZIndex(10)
      }
      const selected = sedesRef.current.find((s) => s.id === selectedId)
      if (selected?.lat != null && selected.lng != null) {
        map.panTo({ lat: selected.lat, lng: selected.lng })
        const zoom = map.getZoom() ?? 12
        if (zoom < 13) map.setZoom(14)
      }
    }
    prevSelectedRef.current = selectedId
  }, [mapReady, selectedId])

  // Pin da localização do usuário
  useEffect(() => {
    const map = mapRef.current
    const g = gRef.current
    if (!mapReady || !map || !g) return

    if (!userLocation) {
      userMarkerRef.current?.setMap(null)
      userMarkerRef.current = null
      return
    }

    if (!userMarkerRef.current) {
      userMarkerRef.current = new g.maps.Marker({
        map,
        position: userLocation,
        title: 'Você está aqui',
        icon: userLocationIcon(g),
        zIndex: 20,
      })
    } else {
      userMarkerRef.current.setPosition(userLocation)
      userMarkerRef.current.setMap(map)
    }
  }, [mapReady, userLocation])

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
        aria-label="Mapa das sedes"
        className="h-full w-full overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]"
      />
      {(mapLoading || withCoords.length === 0) && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl bg-[rgb(var(--background-subtle))]/90 text-[rgb(var(--foreground-muted))]">
          <MapPin className={`h-6 w-6 opacity-50 ${mapLoading ? 'animate-pulse' : ''}`} />
          <p className="px-4 text-center text-sm">
            {mapLoading
              ? 'Carregando mapa…'
              : 'Nenhuma sede com coordenadas para exibir no mapa'}
          </p>
        </div>
      )}
    </div>
  )
}
