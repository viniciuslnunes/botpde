'use client'

import { useId, useState } from 'react'
import dynamic from 'next/dynamic'
import { Image as ImageIcon, MapPin } from 'lucide-react'
import type { SedeExplorerItem } from '@/components/portal/sede-explorer-types'
import type { SedesStreetViewSede } from '@/components/portal/sedes-street-view'
import { isGoogleMapsConfigured } from '@/lib/google-maps'

const SedesMap = dynamic(() => import('@/components/portal/sedes-map').then((m) => m.SedesMap), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full animate-pulse bg-[rgb(var(--background-subtle))]" />
  ),
})

const SedesStreetView = dynamic(
  () => import('@/components/portal/sedes-street-view').then((m) => m.SedesStreetView),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-[rgb(var(--background-subtle))] text-sm text-[rgb(var(--foreground-muted))]">
        Carregando Street View…
      </div>
    ),
  },
)

type MapPoint = Pick<SedeExplorerItem, 'id' | 'nome' | 'lat' | 'lng'>

type TabId = 'mapa' | 'street'

type Props = {
  sedes: MapPoint[]
  selectedId: string | null
  onSelect: (id: string) => void
  userLocation?: { lat: number; lng: number } | null
  streetViewSede: SedesStreetViewSede | null
  className?: string
}

export function SedesMapPanel({
  sedes,
  selectedId,
  onSelect,
  userLocation = null,
  streetViewSede,
  className,
}: Props) {
  const uid = useId()
  const [tab, setTab] = useState<TabId>('mapa')
  const [streetVisited, setStreetVisited] = useState(false)

  const mapsConfigured = isGoogleMapsConfigured()
  const canStreet = mapsConfigured && streetViewSede != null
  const tabEfetiva: TabId = !canStreet && tab === 'street' ? 'mapa' : tab

  const tabMapaId = `${uid}-tab-mapa`
  const tabStreetId = `${uid}-tab-street`
  const panelMapaId = `${uid}-panel-mapa`
  const panelStreetId = `${uid}-panel-street`

  function escolherStreet() {
    if (!canStreet) return
    setTab('street')
    setStreetVisited(true)
  }

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] ${className ?? ''}`}
    >
      <div
        role="tablist"
        aria-label="Mapa e Street View"
        className="flex shrink-0 border-b border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]/50"
      >
        <button
          type="button"
          role="tab"
          id={tabMapaId}
          aria-controls={panelMapaId}
          aria-selected={tabEfetiva === 'mapa'}
          onClick={() => setTab('mapa')}
          className={[
            'app-touch-target flex min-w-0 flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold transition-colors',
            tabEfetiva === 'mapa'
              ? 'border-b-2 border-[rgb(var(--color-primary))] bg-[rgb(var(--surface))] text-[rgb(var(--foreground))]'
              : 'text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]',
          ].join(' ')}
        >
          <MapPin className="h-3.5 w-3.5" aria-hidden />
          Mapa
        </button>
        <button
          type="button"
          role="tab"
          id={tabStreetId}
          aria-controls={panelStreetId}
          aria-selected={tabEfetiva === 'street'}
          disabled={!canStreet}
          title={
            canStreet
              ? 'Ver fachada no Street View'
              : mapsConfigured
                ? 'Selecione um local no mapa ou na lista'
                : 'Street View indisponível'
          }
          onClick={escolherStreet}
          className={[
            'app-touch-target flex min-w-0 flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40',
            tabEfetiva === 'street'
              ? 'border-b-2 border-[rgb(var(--color-primary))] bg-[rgb(var(--surface))] text-[rgb(var(--foreground))]'
              : 'text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]',
          ].join(' ')}
        >
          <ImageIcon className="h-3.5 w-3.5" aria-hidden />
          Street View
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          id={panelMapaId}
          role="tabpanel"
          aria-labelledby={tabMapaId}
          aria-hidden={tabEfetiva !== 'mapa'}
          className={
            tabEfetiva === 'mapa'
              ? 'absolute inset-0'
              : 'invisible pointer-events-none absolute inset-0'
          }
        >
          <SedesMap
            sedes={sedes}
            selectedId={selectedId}
            onSelect={onSelect}
            userLocation={userLocation}
            embedded
            className="h-full w-full"
          />
        </div>

        {streetVisited && streetViewSede && (
          <div
            id={panelStreetId}
            role="tabpanel"
            aria-labelledby={tabStreetId}
            aria-hidden={tabEfetiva !== 'street'}
            className={
              tabEfetiva === 'street'
                ? 'absolute inset-0'
                : 'invisible pointer-events-none absolute inset-0'
            }
          >
            <SedesStreetView sede={streetViewSede} className="h-full w-full" />
          </div>
        )}
      </div>
    </div>
  )
}
