import { Globe } from 'lucide-react'
import {
  formatContagem,
  formatTorcedoresEstimados,
  formatTotalComOnline,
} from '@/lib/format-contagem'
import type { StatsClubeOnboarding } from '@/lib/onboarding-clube-stats'
import type { TorcedoresEstimadosTipo } from '@/lib/onboarding'

type Props = {
  torcedoresEstimados: number | null
  torcedoresEstimadosFonte: string | null
  torcedoresEstimadosTipo: TorcedoresEstimadosTipo | null
  stats: StatsClubeOnboarding
}

function ContagemComOnline({ total, online }: { total: number; online: number }) {
  if (online <= 0) {
    return <span>{formatContagem(total)}</span>
  }

  return (
    <span className="inline-flex flex-wrap items-center justify-center gap-x-1 gap-y-0">
      <span>{formatContagem(total)}</span>
      <span className="text-[rgb(var(--foreground-muted))]" aria-hidden>
        ·
      </span>
      <span className="inline-flex items-center gap-1 text-emerald-500">
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_6px_rgb(16_185_129_/_0.55)]"
          aria-hidden
        />
        <span>{formatContagem(online)} online</span>
      </span>
    </span>
  )
}

function LinhaPlataforma({ rotulo, total, online }: { rotulo: string; total: number; online: number }) {
  if (total <= 0 && online <= 0) return null

  return (
    <span className="text-[10px] text-[rgb(var(--foreground-muted))]">
      {rotulo}{' '}
      <span className="text-[rgb(var(--foreground))]">
        <ContagemComOnline total={total} online={online} />
      </span>
    </span>
  )
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
  const estimativaPlataforma = torcedoresEstimadosTipo === 'PLATAFORMA'
  const temSocios =
    !estimativaPlataforma && (stats.sociosTotal > 0 || stats.sociosOnline > 0)
  const temTorcedores =
    !estimativaPlataforma && (stats.torcedoresTotal > 0 || stats.torcedoresOnline > 0)

  if (!temEstimativa && !temSocios && !temTorcedores) return null

  const tooltipEstimativa =
    torcedoresEstimadosFonte ??
    (torcedoresEstimadosTipo === 'IBOPE_DIGITAL'
      ? 'Base digital oficial (5 redes) — IBOPE Repucom'
      : torcedoresEstimadosTipo === 'PLATAFORMA'
        ? 'Contagem real na plataforma Torcida SaaS'
        : 'Estimativa conservadora com base no menor valor conhecido na base curada')

  return (
    <div className="mt-1 flex w-full flex-col gap-1 border-t border-[rgb(var(--border)_/_0.6)] pt-2">
      {temEstimativa && (
        <span
          className="inline-flex items-center justify-center gap-1 text-[10px] text-[rgb(var(--foreground-muted))]"
          title={tooltipEstimativa}
        >
          <Globe className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
          <span className="underline decoration-dotted decoration-[rgb(var(--foreground-muted)_/_0.45)] underline-offset-2">
            {formatTorcedoresEstimados(torcedoresEstimados!, torcedoresEstimadosTipo)}
          </span>
        </span>
      )}
      <LinhaPlataforma rotulo="Sócios" total={stats.sociosTotal} online={stats.sociosOnline} />
      <LinhaPlataforma
        rotulo="Torcedores"
        total={stats.torcedoresTotal}
        online={stats.torcedoresOnline}
      />
    </div>
  )
}
