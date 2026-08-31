'use client'

import { ArrowRight } from 'lucide-react'
import { EscudoClube } from '@/components/onboarding/escudo-clube'
import { TorcidaOnboardingMeta } from '@/components/onboarding/torcida-onboarding-meta'
import type { TorcidaOnboarding } from '@/lib/onboarding'

type Props = {
  torcida: TorcidaOnboarding
  onEscolher: (t: TorcidaOnboarding) => void
  disabled?: boolean
  /** Primeiros cards: fetch prioritário do logo. */
  priority?: boolean
}

/**
 * Card de torcida organizada — vertical, texto centralizado sob o escudo.
 */
export function TorcidaOnboardingCard({
  torcida,
  onEscolher,
  disabled = false,
  priority = false,
}: Props) {
  return (
    <button
      type="button"
      onClick={() => onEscolher(torcida)}
      disabled={disabled}
      className="group flex h-full w-full min-w-0 cursor-pointer flex-col overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-center transition-[border-color,box-shadow,background-color] duration-150 hover:border-[rgb(var(--color-primary))]/45 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-primary))] disabled:cursor-not-allowed disabled:opacity-50 [content-visibility:auto] [contain-intrinsic-size:auto_220px]"
    >
      <div className="flex w-full shrink-0 items-center justify-center bg-[rgb(var(--background-subtle))] px-5 py-6 sm:px-6 sm:py-7">
        <div className="relative h-28 w-28 sm:h-32 sm:w-32">
          <EscudoClube
            nome={torcida.nome}
            escudoUrl={torcida.logoUrl}
            size="fill"
            priority={priority}
          />
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5 p-3.5 sm:p-4">
        <p className="line-clamp-2 w-full text-xs font-semibold uppercase leading-snug tracking-wide text-[rgb(var(--foreground))] sm:text-sm">
          {torcida.nome}
        </p>
        <TorcidaOnboardingMeta stats={torcida.stats} setor={torcida.setor} align="center" />
        {!torcida.acessivelNoHost && (
          <p className="text-[10px] leading-snug text-amber-600 dark:text-amber-400">
            Portal em outro endereço — aprovação na torcida escolhida.
          </p>
        )}
        <span className="mt-auto inline-flex items-center justify-center gap-1 pt-1 text-[11px] font-medium text-[rgb(var(--color-primary-fg))] opacity-0 transition-opacity group-hover:opacity-100">
          Escolher
          <ArrowRight className="h-3 w-3" aria-hidden />
        </span>
      </div>
    </button>
  )
}
