'use client'

import Image from 'next/image'
import { Check, ExternalLink, MapPin } from 'lucide-react'
import {
  buildGoogleMapsUrl,
  buildStreetViewImageUrl,
  isGoogleMapsConfigured,
} from '@/lib/google-maps'
import type { SedeOnboarding } from '@/lib/onboarding'

const TIPO_LABEL: Record<SedeOnboarding['tipo'], string> = {
  SEDE: 'Sede principal',
  SUBSEDE: 'Subsede',
  PONTO_ENCONTRO: 'Ponto de encontro',
}

type Props = {
  sede: SedeOnboarding
  selecionada: boolean
  onSelecionar: (id: string) => void
}

export function UnidadeOnboardingCard({ sede, selecionada, onSelecionar }: Props) {
  const mapsUrl = buildGoogleMapsUrl(sede)
  const streetViewUrl =
    sede.fotoUrl ?? (isGoogleMapsConfigured() ? buildStreetViewImageUrl(sede) : null)
  const local = [sede.cidade, sede.estado].filter(Boolean).join(' · ')

  return (
    <button
      type="button"
      onClick={() => onSelecionar(sede.id)}
      className={`flex w-full flex-col overflow-hidden rounded-2xl border text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-primary))] ${
        selecionada
          ? 'border-[rgb(var(--color-primary))] bg-[rgb(var(--color-primary))]/5 shadow-sm'
          : 'border-[rgb(var(--border))] bg-[rgb(var(--surface))] hover:border-[rgb(var(--color-primary))]/50'
      }`}
    >
      <div className="relative h-56 w-full bg-[rgb(var(--background-subtle))] sm:h-64">
        {streetViewUrl ? (
          <Image
            src={streetViewUrl}
            alt={`Fachada — ${sede.nome}`}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 720px"
            unoptimized
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-[rgb(var(--foreground-muted))]">
            <MapPin className="h-6 w-6 opacity-60" />
            <span className="text-[10px]">Visualização no mapa indisponível</span>
          </div>
        )}
        {mapsUrl && (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-[10px] font-medium text-white backdrop-blur-sm hover:bg-black/70"
          >
            <ExternalLink className="h-3 w-3" />
            Maps
          </a>
        )}
      </div>

      <div className="flex items-start gap-3 p-5">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold uppercase text-[rgb(var(--foreground))]">{sede.nome}</p>
          <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
            {TIPO_LABEL[sede.tipo]}
            {local ? ` · ${local}` : ''}
          </p>
          {sede.endereco && (
            <p className="mt-1 line-clamp-2 text-xs text-[rgb(var(--foreground-muted))]">
              {sede.endereco}
            </p>
          )}
        </div>
        {selecionada && (
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--color-primary))]" />
        )}
      </div>
    </button>
  )
}
