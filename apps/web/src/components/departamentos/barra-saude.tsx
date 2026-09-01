/** Barra de progresso compacta — meta, orçamento, checklist. Sem número hero. */
export function BarraSaude({
  percentual,
  alerta,
  label,
}: {
  percentual: number
  alerta?: boolean
  label?: string
}) {
  const pct = Math.max(0, Math.min(100, percentual))
  return (
    <div className="min-w-0">
      {label ? (
        <p className="mb-1 flex items-baseline justify-between gap-2 text-[11px] text-[rgb(var(--foreground-muted))]">
          <span className="truncate">{label}</span>
          <span
            className={
              alerta
                ? 'shrink-0 font-medium tabular-nums text-[rgb(var(--color-danger-fg))]'
                : 'shrink-0 font-medium tabular-nums text-[rgb(var(--foreground))]'
            }
          >
            {pct}%
          </span>
        </p>
      ) : null}
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-[rgb(var(--background-subtle))]"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={
            alerta
              ? 'h-full rounded-full bg-[rgb(var(--color-danger-fg))]'
              : 'h-full rounded-full bg-[rgb(var(--primary))]'
          }
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
