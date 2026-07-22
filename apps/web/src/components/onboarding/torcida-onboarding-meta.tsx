import { LinhaPlataforma } from '@/components/onboarding/onboarding-contagem-linhas'
import type { StatsTorcidaOnboarding } from '@/lib/onboarding-torcida-stats'

type Props = {
  stats: StatsTorcidaOnboarding
  /** Grade de cards: centraliza as linhas. */
  align?: 'start' | 'center'
}

/** Metadados do card de torcida no onboarding: sócios aprovados na plataforma. */
export function TorcidaOnboardingMeta({ stats, align = 'start' }: Props) {
  return (
    <div
      className={`mt-1 flex min-h-[14px] flex-col gap-0.5 ${
        align === 'center' ? 'items-center justify-start' : 'justify-end'
      }`}
    >
      <LinhaPlataforma rotulo="Sócios" total={stats.sociosTotal} online={stats.sociosOnline} />
    </div>
  )
}
