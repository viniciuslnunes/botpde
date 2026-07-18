export default function SociosLoading() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-5">
        <div className="app-container animate-pulse space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="h-7 w-28 rounded-lg bg-[rgb(var(--border))]" />
              <div className="h-4 w-52 rounded bg-[rgb(var(--border)_/_0.55)]" />
            </div>
            <div className="h-9 w-40 rounded-lg bg-[rgb(var(--border))]" />
          </div>
          <div className="flex gap-2 overflow-hidden">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-8 w-24 shrink-0 rounded-lg bg-[rgb(var(--border)_/_0.55)]"
              />
            ))}
          </div>
          <div className="h-10 w-full rounded-lg bg-[rgb(var(--border)_/_0.45)]" />
        </div>
      </div>
      <div className="flex-1 overflow-auto py-4">
        <div className="app-container animate-pulse space-y-0 overflow-hidden rounded-xl border border-[rgb(var(--border))]">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 border-b border-[rgb(var(--border)_/_0.6)] px-4 py-3 last:border-b-0"
            >
              <div className="h-8 w-8 shrink-0 rounded-full bg-[rgb(var(--border)_/_0.55)]" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-3.5 w-40 max-w-full rounded bg-[rgb(var(--border)_/_0.55)]" />
                <div className="h-3 w-24 max-w-full rounded bg-[rgb(var(--border)_/_0.4)]" />
              </div>
              <div className="h-7 w-16 shrink-0 rounded-lg bg-[rgb(var(--border)_/_0.45)]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
