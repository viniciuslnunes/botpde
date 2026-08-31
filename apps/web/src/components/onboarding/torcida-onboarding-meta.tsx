import { LinhaPlataforma } from '@/components/onboarding/onboarding-contagem-linhas'
import { formatarSetorArquibancada } from '@torcida/types'
import type { StatsTorcidaOnboarding } from '@/lib/onboarding-torcida-stats'
import type { SetorArquibancadaOnboarding } from '@/lib/onboarding'

type Props = {
  stats: StatsTorcidaOnboarding
  setor?: SetorArquibancadaOnboarding | null
  /** Grade de cards: centraliza as linhas. */
  align?: 'start' | 'center'
}

/** Metadados do card de torcida no onboarding: sócios + setor da Sede. */
export function TorcidaOnboardingMeta({ stats, setor = null, align = 'start' }: Props) {
  const linhaSetor = formatarSetorArquibancada(setor)
  return (
    <div
      className={`mt-1 flex min-h-[14px] flex-col gap-0.5 ${
        align === 'center' ? 'items-center justify-start' : 'justify-end'
      }`}
    >
      <LinhaPlataforma rotulo="Sócios" total={stats.sociosTotal} online={stats.sociosOnline} />
      {linhaSetor ? (
        <p className="text-[10px] leading-snug text-[rgb(var(--foreground-muted))]">{linhaSetor}</p>
      ) : null}
    </div>
  )
}
