'use client'

import Image from 'next/image'
import { MapPin, Navigation } from 'lucide-react'
import {
  buildStreetViewImageUrl,
  isGoogleMapsConfigured,
} from '@/lib/google-maps'
import { formatarDistanciaKm } from '@/lib/onboarding-unidade'
import {
  TIPO_CLASS,
  TIPO_LABEL,
  type SedeExplorerItem,
} from '@/components/portal/sede-explorer-types'

/** Thumbnail compacto — menos bytes que o card do onboarding (240×180). */
const THUMB_W = 160
const THUMB_H = 120

type Props = {
  sede: SedeExplorerItem
  selected: boolean
  distanciaKm: number | null
  onSelect: () => void
  /** Primeiras linhas da lista (acima da dobra). */
  priority?: boolean
  /** Destaque da sede mais próxima quando há geolocalização. */
  maisProxima?: boolean
}

export function SedeExplorerCard({
  sede,
  selected,
  distanciaKm,
  onSelect,
  priority = false,
  maisProxima = false,
}: Props) {
  const streetViewUrl =
    sede.fotoUrl ??
    (isGoogleMapsConfigured()
      ? buildStreetViewImageUrl(sede, { width: THUMB_W, height: THUMB_H })
      : null)
  const local = [sede.cidade, sede.estado].filter(Boolean).join(' · ')
  const distanciaLabel = distanciaKm != null ? formatarDistanciaKm(distanciaKm) : null
  const enderecoLinha = sede.endereco
    ? local
      ? `${sede.endereco} · ${local}`
      : sede.endereco
    : local || null

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      data-sede-id={sede.id}
      className={`group flex w-full items-stretch gap-0 overflow-hidden rounded-xl border text-left transition-[border-color,background-color,box-shadow] duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-primary))] ${
        selected
          ? 'border-[rgb(var(--color-primary))] bg-[rgb(var(--color-primary))]/5 shadow-sm'
          : 'border-[rgb(var(--border))] bg-[rgb(var(--surface))] hover:border-[rgb(var(--color-primary))]/45'
      }`}
    >
      <div className="relative h-[4.75rem] w-[5.25rem] shrink-0 bg-[rgb(var(--background-subtle))] sm:h-[5.25rem] sm:w-[6rem]">
        {streetViewUrl ? (
          <Image
            src={streetViewUrl}
            alt=""
            fill
            className="object-cover"
            sizes="96px"
            unoptimized
            priority={priority}
            loading={priority ? 'eager' : 'lazy'}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[rgb(var(--foreground-muted))]">
            <MapPin className="h-4 w-4 opacity-50" aria-hidden />
          </div>
        )}
        {maisProxima && (
          <span className="absolute bottom-1 left-1 rounded bg-black/65 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-white backdrop-blur-sm">
            Mais perto
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2">
        <div className="min-w-0 flex-1 space-y-0.5">
          <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${TIPO_CLASS[sede.tipo]}`}>
            {TIPO_LABEL[sede.tipo]}
          </span>
          <p className="truncate text-sm font-semibold leading-snug text-[rgb(var(--foreground))]">
            {sede.nome}
          </p>
          {enderecoLinha && (
            <p className="line-clamp-1 text-[11px] leading-snug text-[rgb(var(--foreground-muted))]">
              {enderecoLinha}
            </p>
          )}
        </div>

        {distanciaLabel && (
          <span
            className={`flex shrink-0 flex-col items-end gap-0.5 rounded-lg px-2 py-1.5 tabular-nums ${
              selected || maisProxima
                ? 'bg-[rgb(var(--color-primary))]/10 text-[rgb(var(--color-primary))]'
                : 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground))]'
            }`}
            title={`Aproximadamente ${distanciaLabel}`}
          >
            <Navigation className="h-3 w-3 opacity-70" aria-hidden />
            <span className="text-xs font-semibold leading-none">{distanciaLabel}</span>
          </span>
        )}
      </div>
    </button>
  )
}
