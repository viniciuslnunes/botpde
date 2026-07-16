'use client'

import { EscudoClube } from '@/components/onboarding/escudo-clube'
import { SERIE_LABEL } from '@/components/onboarding/clube-onboarding-card'
import type { AfiliacaoOnboarding } from '@/lib/onboarding'
import { ChevronRight } from 'lucide-react'

type Props = {
  clube: AfiliacaoOnboarding
  onSelecionar: (a: AfiliacaoOnboarding) => void
}

/** Card horizontal — listas do painel do mapa e destaques. */
export function ClubeOnboardingCardRow({ clube, onSelecionar }: Props) {
  return (
    <button
      type="button"
      onClick={() => onSelecionar(clube)}
      className="group flex w-full items-center gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-2.5 text-left transition-all hover:border-[rgb(var(--color-primary))]/70 hover:bg-[rgb(var(--color-primary))]/[0.04] hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-primary))]"
    >
      <EscudoClube
        nome={clube.nome}
        apelido={clube.apelido}
        escudoUrl={clube.escudoUrl}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-bold uppercase tracking-wide text-[rgb(var(--foreground))]">
          {clube.nome}
        </p>
        <p className="truncate text-[10px] text-[rgb(var(--foreground-muted))]">
          {[clube.apelido, clube.estado, clube.serie ? (SERIE_LABEL[clube.serie] ?? clube.serie) : null]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))] opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  )
}
