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
 * Card de torcida organizada — grade do passo Torcida (escudo circular + meta).
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
      className="flex h-full w-full flex-col items-center gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 text-center transition-[border-color,box-shadow,background-color] duration-150 hover:border-[rgb(var(--color-primary))] hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-primary))] disabled:opacity-50 [content-visibility:auto] [contain-intrinsic-size:auto_180px]"
    >
      <EscudoClube
        nome={torcida.nome}
        escudoUrl={torcida.logoUrl}
        size="lg"
        shape="circle"
        priority={priority}
      />
      <div className="min-w-0 w-full">
        <p className="line-clamp-2 text-xs font-semibold uppercase leading-snug tracking-wide text-[rgb(var(--foreground))]">
          {torcida.nome}
        </p>
        <TorcidaOnboardingMeta stats={torcida.stats} align="center" />
        {!torcida.acessivelNoHost && (
          <p className="mt-1.5 text-[10px] leading-snug text-amber-600 dark:text-amber-400">
            Portal em outro endereço — aprovação na torcida escolhida.
          </p>
        )}
      </div>
    </button>
  )
}
