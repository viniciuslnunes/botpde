import { LinhaPlataforma } from '@/components/onboarding/onboarding-contagem-linhas'
import type { StatsTorcidaOnboarding } from '@/lib/onboarding-torcida-stats'

type Props = {
  stats: StatsTorcidaOnboarding
}

/** Metadados do card de torcida no onboarding: sócios/torcedores na plataforma. */
export function TorcidaOnboardingMeta({ stats }: Props) {
  return (
    <div className="mt-1 flex min-h-[32px] flex-col justify-end gap-0.5">
      <LinhaPlataforma rotulo="Sócios" total={stats.sociosTotal} online={stats.sociosOnline} />
      <LinhaPlataforma
        rotulo="Torcedores"
        total={stats.torcedoresTotal}
        online={stats.torcedoresOnline}
      />
    </div>
  )
}
