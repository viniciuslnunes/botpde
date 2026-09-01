'use client'

import Image from 'next/image'
import { useState, type KeyboardEvent, type MouseEvent } from 'react'
import { Check, ExternalLink, MapPin, Navigation } from 'lucide-react'
import {
  buildGoogleMapsUrl,
  resolveSedeLocationImage,
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

/**
 * Street View Static API aceita no máximo 640×640.
 * @see https://developers.google.com/maps/documentation/streetview/request-streetview
 */
const THUMB = {
  featured: { w: 640, h: 320 },
  compact: { w: 400, h: 225 },
} as const

type Props = {
  sede: SedeOnboardingComDistancia
  selecionada: boolean
  onSelecionar: (id: string) => void
  priority?: boolean
  /** Grade multi-coluna — tipografia e mídia mais densas. */
  compact?: boolean
}

/**
 * Card vertical: Street View (localização) em cima; tipo, nome, endereço e
 * distância no corpo. Distância também no canto da mídia.
 */
export function UnidadeOnboardingCard({
  sede,
  selecionada,
  onSelecionar,
  priority = false,
  compact = false,
}: Props) {
  const thumb = compact ? THUMB.compact : THUMB.featured
  const mapsUrl = buildGoogleMapsUrl(sede)
  const streetViewUrl = resolveSedeLocationImage(sede, {
    width: thumb.w,
    height: thumb.h,
  })
  const [midiaFalhou, setMidiaFalhou] = useState(false)
  const mostrarFoto = Boolean(streetViewUrl) && !midiaFalhou
  const local = [sede.cidade, sede.estado].filter(Boolean).join(' · ')
  const distanciaLabel =
    sede.distanciaKm != null ? formatarDistanciaKm(sede.distanciaKm) : null

  function abrirMapa(e: MouseEvent | KeyboardEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (mapsUrl) window.open(mapsUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <button
      type="button"
      onClick={() => onSelecionar(sede.id)}
      aria-pressed={selecionada}
      className={`group flex h-full w-full min-w-0 cursor-pointer flex-col overflow-hidden rounded-2xl border text-left transition-[border-color,box-shadow,background-color] duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-primary))] [content-visibility:auto] [contain-intrinsic-size:auto_260px] ${
        selecionada
          ? 'border-[rgb(var(--color-primary))] bg-[rgb(var(--color-primary))]/5 shadow-sm'
          : 'border-[rgb(var(--border))] bg-[rgb(var(--surface))] hover:border-[rgb(var(--color-primary))]/45 hover:shadow-sm'
      }`}
    >
      <div
        className={`relative w-full shrink-0 overflow-hidden bg-[rgb(var(--background-subtle))] ${
          compact ? 'aspect-[16/9]' : 'aspect-[2/1]'
        }`}
      >
        {mostrarFoto ? (
          <Image
            src={streetViewUrl!}
            alt={`Fachada — ${sede.nome}`}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            sizes={
              compact
                ? '(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw'
                : '(max-width: 768px) 100vw, 640px'
            }
            priority={priority}
            unoptimized
            onError={() => setMidiaFalhou(true)}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-[rgb(var(--foreground-muted))]">
            <MapPin className="h-5 w-5 opacity-45" aria-hidden />
            <span className="text-[10px]">Sem foto</span>
          </div>
        )}

        {distanciaLabel ? (
          <span
            className="absolute bottom-2 left-2 z-[1] inline-flex items-center gap-1 rounded-md bg-black/65 px-1.5 py-1 text-[10px] font-semibold tabular-nums text-white backdrop-blur-sm"
            title={`Aproximadamente ${distanciaLabel} da sua região`}
          >
            <Navigation className="h-3 w-3 opacity-90" aria-hidden />
            {distanciaLabel}
          </span>
        ) : null}

        <span
          className={`absolute right-2 top-2 z-[1] flex h-6 w-6 items-center justify-center rounded-full border backdrop-blur-sm ${
            selecionada
              ? 'border-white bg-[rgb(var(--color-primary))] text-primary-on'
              : 'border-white/40 bg-black/45 text-transparent'
          }`}
          aria-hidden
        >
          <Check className="h-3.5 w-3.5" />
        </span>
      </div>

      <div
        className={`flex w-full min-w-0 flex-1 flex-col ${
          compact ? 'gap-1.5 p-3' : 'gap-2 p-4'
        }`}
      >
        <div className="flex w-full min-w-0 items-center justify-between gap-2">
          <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            {TIPO_LABEL[sede.tipo]}
          </span>
          {local ? (
            <span className="max-w-[50%] shrink-0 truncate text-right text-[10px] text-[rgb(var(--foreground-muted))]">
              {local}
            </span>
          ) : null}
        </div>

        <p
          className={`w-full line-clamp-2 font-semibold uppercase leading-snug tracking-wide text-[rgb(var(--foreground))] ${
            compact ? 'text-xs' : 'text-sm'
          }`}
        >
          {sede.nome}
        </p>

        {sede.endereco ? (
          <p
            className={`w-full line-clamp-2 text-[rgb(var(--foreground-muted))] ${
              compact ? 'text-[10px] leading-snug' : 'text-[11px] leading-snug'
            }`}
          >
            {sede.endereco}
          </p>
        ) : null}

        {mapsUrl ? (
          <span
            role="link"
            tabIndex={0}
            onClick={abrirMapa}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') abrirMapa(e)
            }}
            className="mt-auto inline-flex w-fit items-center gap-1 pt-1 text-[11px] font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
            aria-label={`Abrir ${sede.nome} no Google Maps`}
          >
            Ver no mapa
            <ExternalLink className="h-3 w-3" aria-hidden />
          </span>
        ) : null}
      </div>
    </button>
  )
}
