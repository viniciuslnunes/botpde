export default function FinanceiroLoading() {
  return (
    <div className="mx-auto max-w-4xl animate-pulse space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-[rgb(var(--border))]" />
        <div className="space-y-2">
          <div className="h-7 w-40 rounded-lg bg-[rgb(var(--border))]" />
          <div className="h-4 w-56 rounded bg-[rgb(var(--border))]" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-[rgb(var(--border))] px-4 py-3"
          >
            <div className="h-3 w-16 rounded bg-[rgb(var(--border))]" />
            <div className="mt-2 h-6 w-24 rounded bg-[rgb(var(--border))]" />
          </div>
        ))}
      </div>
      <div className="h-28 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]" />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-16 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]"
          />
        ))}
      </div>
    </div>
  )
}
