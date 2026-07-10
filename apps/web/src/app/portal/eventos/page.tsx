import { Suspense } from 'react'
import type { Metadata } from 'next'
import {
  EventosListaFallback,
  EventosPassadosSection,
  EventosProximosSection,
} from './_components/eventos-listas'

export const metadata: Metadata = { title: 'Eventos' }

export default function EventosPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Eventos</h1>
        <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
          Partidas, caravanas e encontros da torcida
        </p>
      </div>

      <Suspense fallback={<EventosListaFallback />}>
        <EventosProximosSection />
      </Suspense>

      <Suspense fallback={<EventosListaFallback />}>
        <EventosPassadosSection />
      </Suspense>
    </div>
  )
}
