'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { ImageIcon, MapPin } from 'lucide-react'
import {
  STREET_VIEW_DEFAULTS,
  isGoogleMapsConfigured,
  loadGoogleMapsStreetViewLibrary,
  resolveSedeLocationImage,
  streetViewFovToZoom,
  type GoogleStreetViewPanorama,
} from '@/lib/google-maps'

export type SedesStreetViewSede = {
  id: string
  nome: string
  lat: number
  lng: number
  streetViewHeading: number | null
  streetViewPitch: number | null
  streetViewFov: number | null
}

type Coverage = 'unknown' | 'ok' | 'none'

type Props = {
  sede: SedesStreetViewSede
  className?: string
}

export function SedesStreetView({ sede, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const panoRef = useRef<GoogleStreetViewPanorama | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [coverage, setCoverage] = useState<Coverage>('unknown')

  const configured = isGoogleMapsConfigured()
  const fallbackUrl = resolveSedeLocationImage(sede, { width: 640, height: 360 })

  useEffect(() => {
    if (!configured || !containerRef.current) return
    let cancelled = false
    setLoading(true)
    setLoadFailed(false)
    setCoverage('unknown')

    async function init() {
      try {
        const { streetView } = await loadGoogleMapsStreetViewLibrary()
        if (cancelled || !containerRef.current) return

        try {
          const service = new streetView.StreetViewService()
          await service.getPanorama({
            location: { lat: sede.lat, lng: sede.lng },
            radius: 100,
          })
        } catch {
          if (!cancelled) {
            setCoverage('none')
            setLoading(false)
          }
          return
        }

        if (cancelled || !containerRef.current) return

        const heading = sede.streetViewHeading ?? STREET_VIEW_DEFAULTS.heading
        const pitch = sede.streetViewPitch ?? STREET_VIEW_DEFAULTS.pitch
        const fov = sede.streetViewFov ?? STREET_VIEW_DEFAULTS.fov
        const pano = new streetView.StreetViewPanorama(containerRef.current, {
          position: { lat: sede.lat, lng: sede.lng },
          pov: { heading, pitch },
          zoom: streetViewFovToZoom(fov),
          visible: true,
          addressControl: false,
          fullscreenControl: true,
          linksControl: true,
          panControl: true,
          zoomControl: true,
          enableCloseButton: false,
          motionTracking: false,
          motionTrackingControl: false,
        })
        panoRef.current = pano
        setCoverage('ok')
        setLoading(false)
      } catch {
        if (!cancelled) {
          setLoadFailed(true)
          setLoading(false)
        }
      }
    }

    void init()
    return () => {
      cancelled = true
      panoRef.current = null
      containerRef.current?.replaceChildren()
    }
  }, [
    configured,
    sede.id,
    sede.lat,
    sede.lng,
    sede.streetViewHeading,
    sede.streetViewPitch,
    sede.streetViewFov,
  ])

  if (!configured) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-2 bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))] ${className ?? ''}`}
      >
        <MapPin className="h-6 w-6 opacity-50" />
        <p className="px-4 text-center text-sm">Street View indisponível — configure a chave do Google Maps</p>
      </div>
    )
  }

  const showFallbackImage = (loadFailed || coverage === 'none') && Boolean(fallbackUrl)
  const showEmpty = (loadFailed || coverage === 'none') && !fallbackUrl

  return (
    <div className={`flex flex-col ${className ?? ''}`}>
      <div className="relative min-h-0 flex-1">
        <div
          ref={containerRef}
          role="application"
          aria-label={`Street View — ${sede.nome}`}
          className="h-full w-full overflow-hidden bg-[rgb(var(--background-subtle))]"
        />
        {showFallbackImage && fallbackUrl && (
          <div className="absolute inset-0">
            <Image
              src={fallbackUrl}
              alt={`Fachada — ${sede.nome}`}
              fill
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 60vw"
              unoptimized
            />
          </div>
        )}
        {(loading || showEmpty) && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[rgb(var(--background-subtle))]/90 text-[rgb(var(--foreground-muted))]">
            {showEmpty ? (
              <>
                <ImageIcon className="h-6 w-6 opacity-50" />
                <p className="px-4 text-center text-sm">Sem cobertura Street View neste ponto</p>
              </>
            ) : (
              <>
                <MapPin className="h-6 w-6 animate-pulse opacity-50" />
                <p className="px-4 text-center text-sm">Carregando Street View…</p>
              </>
            )}
          </div>
        )}
      </div>
      {coverage === 'ok' && !loading && (
        <p className="shrink-0 border-t border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2.5 text-[11px] text-[rgb(var(--foreground-muted))]">
          Arraste para olhar ao redor
        </p>
      )}
    </div>
  )
}
