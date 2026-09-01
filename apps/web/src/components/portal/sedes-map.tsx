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
import type { SedeExplorerItem } from '@/components/portal/sede-explorer-types'
import { useLatestRef } from '@/lib/use-latest-ref'

type MapPoint = Pick<SedeExplorerItem, 'id' | 'nome' | 'lat' | 'lng'>

type Props = {
  sedes: MapPoint[]
  selectedId: string | null
  onSelect: (id: string) => void
  /** Posição do usuário — pin na cor da marca (nunca azul de mapa genérico). */
  userLocation?: { lat: number; lng: number } | null
  /** Sem borda/raio — o painel com abas já desenha o chrome. */
  embedded?: boolean
  className?: string
}

const DEFAULT_CENTER = { lat: -23.55, lng: -46.63 }

function cssVarRgb(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  if (!raw) return fallback
  const ch = raw.split(/[\s,/]+/).filter(Boolean)
  if (ch.length >= 3) return `rgb(${ch[0]} ${ch[1]} ${ch[2]})`
  return raw.startsWith('#') || raw.startsWith('rgb') ? raw : fallback
}

function pinContent(
  markerLib: GoogleMapsMarkerLibrary,
  kind: 'sede' | 'sede-selected' | 'user',
): HTMLElement {
  // PinElement é HTMLElement — usar a instância direto (`.element` está deprecated).
  const primary = cssVarRgb('--color-primary', '#0a0a0a')
  const muted = cssVarRgb('--foreground-muted', '#71717a')
  if (kind === 'user') {
    return new markerLib.PinElement({
      background: primary,
      borderColor: '#ffffff',
      glyphColor: '#ffffff',
      scale: 1.05,
    })
  }
  if (kind === 'sede-selected') {
    return new markerLib.PinElement({
      background: primary,
      borderColor: '#ffffff',
      glyphColor: '#ffffff',
      scale: 1.25,
    })
  }
  return new markerLib.PinElement({
    background: muted,
    borderColor: '#ffffff',
    glyphColor: '#ffffff',
    scale: 1,
  })
}

export function SedesMap({
  sedes,
  selectedId,
  onSelect,
  userLocation = null,
  embedded = false,
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<GoogleMapInstance | null>(null)
  /**
   * Markers vivos do Google Maps, por id de sede.
   *
   * Fica em ref de propósito: são objetos imperativos da API, criados e
   * destruídos pelos effects, que precisam sobreviver entre renders sem
   * disparar novo render. O `react-hooks/immutability` acusa a mutação
   * (`m.map = null` na poda) — é limitação do React Compiler com interop
   * imperativo, não bug. Tentar tirar daqui piora: em `useState` o compilador
   * passa a acusar também "cannot modify local variables after render".
   */
  const markersRef = useRef<Map<string, GoogleMarkerInstance>>(new Map())
  const userMarkerRef = useRef<GoogleMarkerInstance | null>(null)
  const gRef = useRef<GoogleMapsNamespace | null>(null)
  const markerLibRef = useRef<GoogleMapsMarkerLibrary | null>(null)
  const fittedKeyRef = useRef<string>('')
  const prevSelectedRef = useRef<string | null>(selectedId)
  const [mapReady, setMapReady] = useState(false)
  const [mapLoading, setMapLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)

  // Lidas dentro de effects e do handler de clique do marker, nunca no render.
  const onSelectRef = useLatestRef(onSelect)
  const selectedIdRef = useLatestRef(selectedId)
  const sedesRef = useLatestRef(sedes)

  const configured = isGoogleMapsConfigured()
  const withCoords = sedes.filter((s) => s.lat != null && s.lng != null)
  const coordsKey = withCoords.map((s) => `${s.id}:${s.lat},${s.lng}`).join('|')

  useEffect(() => {
    if (!configured || !containerRef.current) return
    let cancelled = false
    setMapLoading(true)
    // Copiado no setup para o cleanup não reler a ref depois.
    const markers = markersRef.current

    async function init() {
      try {
        const { g, marker, Map } = await loadGoogleMapsMarkerLibrary()
        if (cancelled || !containerRef.current) return
        gRef.current = g
        markerLibRef.current = marker

        const map = new Map(containerRef.current, {
          center: DEFAULT_CENTER,
          zoom: 11,
          mapId: getGoogleMapsMapId(),
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
      for (const m of markers.values()) {
        m.map = null
      }
      markers.clear()
      if (userMarkerRef.current) userMarkerRef.current.map = null
      userMarkerRef.current = null
      mapRef.current = null
      gRef.current = null
      markerLibRef.current = null
      setMapReady(false)
    }
  }, [configured])

  // Sync markers quando o conjunto de coordenadas muda
  useEffect(() => {
    const map = mapRef.current
    const g = gRef.current
    const markerLib = markerLibRef.current
    if (!mapReady || !map || !g || !markerLib) return

    const points = sedes.filter((s) => s.lat != null && s.lng != null)
    const alive = new Set(points.map((s) => s.id))
    const selected = selectedIdRef.current
    const markers = markersRef.current

    for (const [id, m] of markers) {
      if (!alive.has(id)) {
        m.map = null
        markers.delete(id)
      }
    }

    for (const sede of points) {
      const pos = { lat: sede.lat!, lng: sede.lng! }
      let m = markers.get(sede.id)
      if (!m) {
        const selectedNow = sede.id === selected
        m = new markerLib.AdvancedMarkerElement({
          map,
          position: pos,
          title: sede.nome,
          content: pinContent(markerLib, selectedNow ? 'sede-selected' : 'sede'),
          zIndex: selectedNow ? 10 : 1,
        })
        m.addEventListener('gmp-click', () => onSelectRef.current(sede.id))
        markers.set(sede.id, m)
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
  }, [mapReady, sedes, coordsKey, onSelectRef, selectedIdRef])

  // Só atualiza pin do anterior + selecionado
  useEffect(() => {
    const map = mapRef.current
    const markerLib = markerLibRef.current
    if (!mapReady || !map || !markerLib) return

    const prev = prevSelectedRef.current
    if (prev && prev !== selectedId) {
      const prevMarker = markersRef.current.get(prev)
      if (prevMarker) {
        prevMarker.content = pinContent(markerLib, 'sede')
        prevMarker.zIndex = 1
      }
    }
    if (selectedId) {
      const m = markersRef.current.get(selectedId)
      if (m) {
        m.content = pinContent(markerLib, 'sede-selected')
        m.zIndex = 10
      }
      const selected = sedesRef.current.find((s) => s.id === selectedId)
      if (selected?.lat != null && selected.lng != null) {
        map.panTo({ lat: selected.lat, lng: selected.lng })
        const zoom = map.getZoom() ?? 12
        if (zoom < 13) map.setZoom(14)
      }
    }
    prevSelectedRef.current = selectedId
  }, [mapReady, selectedId, sedesRef])

  // Pin da localização do usuário
  useEffect(() => {
    const map = mapRef.current
    const markerLib = markerLibRef.current
    if (!mapReady || !map || !markerLib) return

    if (!userLocation) {
      if (userMarkerRef.current) userMarkerRef.current.map = null
      userMarkerRef.current = null
      return
    }

    if (!userMarkerRef.current) {
      userMarkerRef.current = new markerLib.AdvancedMarkerElement({
        map,
        position: userLocation,
        title: 'Você está aqui',
        content: pinContent(markerLib, 'user'),
        zIndex: 20,
      })
    } else {
      userMarkerRef.current.position = userLocation
      userMarkerRef.current.map = map
    }
  }, [mapReady, userLocation])

  const chrome = embedded ? '' : 'rounded-xl border border-[rgb(var(--border))]'

  if (!configured || loadFailed) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-2 bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))] ${
          embedded ? '' : 'rounded-xl border border-dashed border-[rgb(var(--border))]'
        } ${className ?? ''}`}
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
        className={`h-full w-full overflow-hidden bg-[rgb(var(--background-subtle))] ${chrome}`}
      />
      {(mapLoading || withCoords.length === 0) && (
        <div
          className={`pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[rgb(var(--background-subtle))]/90 text-[rgb(var(--foreground-muted))] ${embedded ? '' : 'rounded-xl'}`}
        >
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
