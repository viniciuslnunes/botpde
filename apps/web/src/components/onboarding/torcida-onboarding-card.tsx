'use client'

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
 * Card de torcida organizada — escudo circular à esquerda (altura do card),
 * nome e meta à direita.
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
      className="flex h-full w-full items-stretch overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-0 text-left transition-[border-color,box-shadow,background-color] duration-150 hover:border-[rgb(var(--color-primary))] hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-primary))] disabled:opacity-50 [content-visibility:auto] [contain-intrinsic-size:auto_112px]"
    >
      <div className="flex w-[5.75rem] shrink-0 items-center justify-center self-stretch border-r border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] sm:w-[7rem]">
        <div className="p-2.5 sm:p-3">
          <EscudoClube
            nome={torcida.nome}
            escudoUrl={torcida.logoUrl}
            size="xl"
            shape="circle"
            priority={priority}
          />
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 p-3.5 sm:p-4">
        <p className="line-clamp-2 text-xs font-semibold uppercase leading-snug tracking-wide text-[rgb(var(--foreground))] sm:text-sm">
          {torcida.nome}
        </p>
        <TorcidaOnboardingMeta stats={torcida.stats} align="start" />
        {!torcida.acessivelNoHost && (
          <p className="text-[10px] leading-snug text-amber-600 dark:text-amber-400">
            Portal em outro endereço — aprovação na torcida escolhida.
          </p>
        )}
      </div>
    </button>
  )
}
