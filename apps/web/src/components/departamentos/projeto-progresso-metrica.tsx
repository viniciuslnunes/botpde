import { Target, Wallet, type LucideIcon } from 'lucide-react'

type Tom = 'primary' | 'success' | 'warning' | 'danger' | 'muted'

const TOM_BARRA: Record<Tom, string> = {
  primary: 'bg-[rgb(var(--primary))]',
  success: 'bg-[rgb(var(--color-success-fg))]',
  warning: 'bg-[rgb(var(--color-warning-fg))]',
  danger: 'bg-[rgb(var(--color-danger-fg))]',
  muted: 'bg-[rgb(var(--foreground-muted))]',
}

const TOM_PCT: Record<Tom, string> = {
  primary: 'text-[rgb(var(--color-primary-fg))]',
  success: 'text-[rgb(var(--color-success-fg))]',
  warning: 'text-[rgb(var(--color-warning-fg))]',
  danger: 'text-[rgb(var(--color-danger-fg))]',
  muted: 'text-[rgb(var(--foreground-muted))]',
}

const TOM_FUNDO: Record<Tom, string> = {
  primary: 'bg-[rgb(var(--primary)_/_0.08)]',
  success: 'bg-[rgb(var(--color-success)_/_0.12)]',
  warning: 'bg-[rgb(var(--color-warning)_/_0.12)]',
  danger: 'bg-[rgb(var(--color-danger)_/_0.12)]',
  muted: 'bg-[rgb(var(--background-subtle))]',
}

function tomMeta(pct: number, emRisco?: boolean): Tom {
  if (pct >= 100) return 'success'
  if (emRisco || pct < 50) return 'warning'
  return 'primary'
}

function tomOrcamento(pct: number, estourou?: boolean): Tom {
  if (estourou) return 'danger'
  if (pct >= 90) return 'warning'
  return 'primary'
}

const ROTULO: Record<'meta' | 'orcamento', { icone: LucideIcon; titulo: string; vazio: string }> = {
  meta: { icone: Target, titulo: 'Meta', vazio: 'Sem meta declarada' },
  orcamento: { icone: Wallet, titulo: 'Orçamento', vazio: 'Sem orçamento previsto' },
}

/** Painel de meta ou orçamento — lista de saúde e ficha do projeto. */
export function ProjetoProgressoMetrica({
  variant,
  percentual,
  label,
  emRisco,
  estourou,
}: {
  variant: 'meta' | 'orcamento'
  percentual: number | null
  label: string | null
  /** Meta abaixo de 50% em projeto ativo. */
  emRisco?: boolean
  estourou?: boolean
}) {
  const { icone: Icone, titulo, vazio } = ROTULO[variant]

  if (percentual == null || !label) {
    return (
      <div className="rounded-lg border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--background-subtle)_/_0.35)] px-3 py-2.5">
        <p className="flex items-center gap-1.5 text-[11px] text-[rgb(var(--foreground-muted))]">
          <Icone className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
          {vazio}
        </p>
      </div>
    )
  }

  const pct = Math.max(0, Math.min(100, percentual))
  const tom =
    variant === 'meta' ? tomMeta(pct, emRisco) : tomOrcamento(pct, estourou)

  return (
    <div
      className={`rounded-lg px-3 py-2.5 ${TOM_FUNDO[tom]}`}
      role="group"
      aria-label={`${titulo}: ${label}, ${pct}%`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          <Icone className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {titulo}
        </p>
        <span className={`text-sm font-bold tabular-nums leading-none ${TOM_PCT[tom]}`}>
          {pct}%
        </span>
      </div>
      <p className="mt-1 truncate text-xs text-[rgb(var(--foreground))]" title={label}>
        {label}
      </p>
      <div
        className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[rgb(var(--background)_/_0.65)]"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={`h-full rounded-full motion-safe:transition-[width] motion-safe:duration-500 motion-safe:ease-out ${TOM_BARRA[tom]}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
