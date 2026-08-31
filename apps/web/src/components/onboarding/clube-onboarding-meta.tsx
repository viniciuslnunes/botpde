import { Globe } from 'lucide-react'
import {
  LinhaPlataforma,
} from '@/components/onboarding/onboarding-contagem-linhas'
import {
  formatTorcedoresEstimados,
  TOOLTIP_ESTIMATIVA_INDISPONIVEL,
  TOOLTIP_ESTIMATIVA_PESQUISA,
} from '@/lib/format-contagem'
import type { StatsClubeOnboarding } from '@/lib/onboarding-clube-stats'
import type { TorcedoresEstimadosTipo } from '@/lib/onboarding'

type Props = {
  torcedoresEstimados: number | null
  torcedoresEstimadosFonte: string | null
  torcedoresEstimadosTipo: TorcedoresEstimadosTipo | null
  stats: StatsClubeOnboarding
}

/**
 * Metadados do card de clube no onboarding: estimativa web + contagens da plataforma.
 */
export function ClubeOnboardingMeta({
  torcedoresEstimados,
  torcedoresEstimadosFonte,
  torcedoresEstimadosTipo,
  stats,
}: Props) {
  const temEstimativa = torcedoresEstimados != null && torcedoresEstimados > 0

  if (!temEstimativa) return null

  const tooltipEstimativa =
    torcedoresEstimadosFonte ??
    (torcedoresEstimadosTipo === 'PESQUISA'
      ? TOOLTIP_ESTIMATIVA_PESQUISA
      : torcedoresEstimadosTipo === 'IBOPE_DIGITAL'
        ? 'Base digital oficial (5 redes) — IBOPE Repucom'
        : torcedoresEstimadosTipo === 'PLATAFORMA'
          ? 'Contagem real na plataforma Torcida SaaS'
          : TOOLTIP_ESTIMATIVA_INDISPONIVEL)

  return (
    <div className="mt-auto flex w-full min-h-[52px] flex-col justify-end gap-1 border-t border-[rgb(var(--border)_/_0.6)] pt-2">
      <span
        className="inline-flex min-h-[14px] items-center justify-center gap-1 text-[10px] text-[rgb(var(--foreground-muted))]"
        title={tooltipEstimativa}
      >
        <Globe className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
        <span className="underline decoration-dotted decoration-[rgb(var(--foreground-muted)_/_0.45)] underline-offset-2">
          {formatTorcedoresEstimados(torcedoresEstimados!, torcedoresEstimadosTipo)}
        </span>
      </span>
      <LinhaPlataforma rotulo="Sócios" total={stats.sociosTotal} online={stats.sociosOnline} />
      <LinhaPlataforma
        rotulo="Torcedores"
        total={stats.torcedoresTotal}
        online={stats.torcedoresOnline}
      />
    </div>
  )
}
