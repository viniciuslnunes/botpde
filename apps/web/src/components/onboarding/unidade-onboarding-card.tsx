'use client'

import Image from 'next/image'
import { Check, ExternalLink, MapPin } from 'lucide-react'
import {
  buildGoogleMapsUrl,
  buildStreetViewImageUrl,
  isGoogleMapsConfigured,
} from '@/lib/google-maps'
import {
  formatarDistanciaKm,
  type SedeOnboardingComDistancia,
} from '@/lib/onboarding-unidade'

const TIPO_LABEL: Record<SedeOnboardingComDistancia['tipo'], string> = {
  SEDE: 'Sede principal',
  SUBSEDE: 'Subsede',
  PONTO_ENCONTRO: 'Ponto de encontro',
}

/** Thumbnail compacto — evita baixar Street View 640×280 para card denso. */
const THUMB_W = 240
const THUMB_H = 180

type Props = {
  sede: SedeOnboardingComDistancia
  selecionada: boolean
  onSelecionar: (id: string) => void
  /** Prioriza LCP nas primeiras recomendações acima da dobra. */
  priority?: boolean
}

export function UnidadeOnboardingCard({
  sede,
  selecionada,
  onSelecionar,
  priority = false,
}: Props) {
  const mapsUrl = buildGoogleMapsUrl(sede)
  const streetViewUrl =
    sede.fotoUrl ??
    (isGoogleMapsConfigured()
      ? buildStreetViewImageUrl(sede, { width: THUMB_W, height: THUMB_H })
      : null)
  const local = [sede.cidade, sede.estado].filter(Boolean).join(' · ')
  const distanciaLabel =
    sede.distanciaKm != null ? formatarDistanciaKm(sede.distanciaKm) : null

  return (
    <button
      type="button"
      onClick={() => onSelecionar(sede.id)}
      aria-pressed={selecionada}
      className={`flex w-full items-stretch gap-0 overflow-hidden rounded-xl border text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-primary))] ${
        selecionada
          ? 'border-[rgb(var(--color-primary))] bg-[rgb(var(--color-primary))]/5'
          : 'border-[rgb(var(--border))] bg-[rgb(var(--surface))] hover:border-[rgb(var(--color-primary))]/50'
      }`}
    >
      <div className="relative h-[4.5rem] w-[5.5rem] shrink-0 bg-[rgb(var(--background-subtle))] sm:h-[5rem] sm:w-[6.5rem]">
        {streetViewUrl ? (
          <Image
            src={streetViewUrl}
            alt={`Fachada — ${sede.nome}`}
            fill
            className="object-cover"
            sizes="104px"
            priority={priority}
            unoptimized
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-0.5 text-[rgb(var(--foreground-muted))]">
            <MapPin className="h-4 w-4 opacity-60" />
            <span className="px-1 text-center text-[9px] leading-tight">Sem foto</span>
          </div>
        )}
        {mapsUrl && (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="absolute right-1 top-1 inline-flex items-center justify-center rounded-md bg-black/55 p-1 text-white backdrop-blur-sm hover:bg-black/70"
            aria-label={`Abrir ${sede.nome} no Google Maps`}
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      <div className="flex min-w-0 flex-1 items-start gap-2 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold uppercase leading-snug text-[rgb(var(--foreground))]">
            {sede.nome}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-[rgb(var(--foreground-muted))]">
            {TIPO_LABEL[sede.tipo]}
            {local ? ` · ${local}` : ''}
            {distanciaLabel ? ` · ${distanciaLabel}` : ''}
          </p>
          {sede.endereco && (
            <p className="mt-0.5 line-clamp-1 text-[11px] text-[rgb(var(--foreground-muted))]">
              {sede.endereco}
            </p>
          )}
        </div>
        <span
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
            selecionada
              ? 'border-[rgb(var(--color-primary))] bg-[rgb(var(--color-primary))] text-white'
              : 'border-[rgb(var(--border))] text-transparent'
          }`}
          aria-hidden
        >
          <Check className="h-3 w-3" />
        </span>
      </div>
    </button>
  )
}
