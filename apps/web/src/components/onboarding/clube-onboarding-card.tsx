'use client'

import { EscudoClube, type EscudoClubeSize } from '@/components/onboarding/escudo-clube'
import { ClubeOnboardingMeta } from '@/components/onboarding/clube-onboarding-meta'
import type { AfiliacaoOnboarding } from '@/lib/onboarding'

export const SERIE_LABEL: Record<string, string> = {
  A: 'Série A',
  B: 'Série B',
  C: 'Série C',
  D: 'Série D',
  ESTADUAL: 'Estadual',
  OUTRA: 'Outra',
}

type Props = {
  clube: AfiliacaoOnboarding
  onSelecionar: (a: AfiliacaoOnboarding) => void
  /** Compacto para painéis de hover do mapa. */
  compact?: boolean
}

/**
 * Card de clube do passo Clube — mesma informação da grade e do hover do mapa.
 * Hit-target = card inteiro (`[&_*]:pointer-events-none` evita imagem/meta
 * interceptarem o clique no mobile).
 */
export function ClubeOnboardingCard({ clube, onSelecionar, compact = false }: Props) {
  const escudoSize: EscudoClubeSize = compact ? 'sm' : 'md'
  const label = clube.apelido || clube.nome

  return (
    <button
      type="button"
      onClick={() => onSelecionar(clube)}
      aria-label={`Selecionar ${label}`}
      className={`flex h-full w-full cursor-pointer flex-col items-center gap-2 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-center transition-all hover:border-[rgb(var(--color-primary))] hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-primary))] [&_*]:pointer-events-none ${
        compact ? 'p-3' : 'p-4'
      }`}
    >
      <EscudoClube
        nome={clube.nome}
        apelido={clube.apelido}
        escudoUrl={clube.escudoUrl}
        size={escudoSize}
      />
      <span
        className={`font-semibold uppercase text-[rgb(var(--foreground))] line-clamp-2 ${
          compact ? 'text-[10px]' : 'text-xs'
        }`}
      >
        {clube.nome}
      </span>
      {(clube.apelido || clube.estado) && (
        <span className="text-[10px] text-[rgb(var(--foreground-muted))] line-clamp-1">
          {[clube.apelido, clube.estado].filter(Boolean).join(' · ')}
        </span>
      )}
      {clube.serie && (
        <span className="text-[10px] text-[rgb(var(--foreground-muted))]">
          {SERIE_LABEL[clube.serie] ?? clube.serie}
        </span>
      )}
      <ClubeOnboardingMeta
        torcedoresEstimados={clube.torcedoresEstimados}
        torcedoresEstimadosFonte={clube.torcedoresEstimadosFonte}
        torcedoresEstimadosTipo={clube.torcedoresEstimadosTipo}
        stats={clube.stats}
      />
    </button>
  )
}
