/** Skeletons do posto de comando (Suspense: KPIs primeiro, inbox depois). */

export function DirecaoKpisSkeleton({ cols = 4 }: { cols?: 3 | 4 }) {
  return (
    <div
      className={
        cols === 3
          ? 'grid gap-3 sm:grid-cols-3'
          : 'grid gap-3 sm:grid-cols-2 lg:grid-cols-4'
      }
      aria-hidden
    >
      {Array.from({ length: cols }).map((_, i) => (
        <div
          key={i}
          className="h-[5.5rem] animate-pulse rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]"
        />
      ))}
    </div>
  )
}

export function DirecaoInboxSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy aria-label="Carregando pendências">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-[4.5rem] animate-pulse rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]"
        />
      ))}
    </div>
  )
}

export function DirecaoListaSkeleton() {
  return (
    <div className="space-y-2" aria-busy aria-label="Carregando lista">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="h-16 animate-pulse rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]"
        />
      ))}
    </div>
  )
}
