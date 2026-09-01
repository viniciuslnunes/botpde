export default function RelatoriosLoading() {
  return (
    <div className="animate-pulse">
      <div className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-5">
        <div className="app-container">
          <div className="h-8 w-56 rounded-lg bg-[rgb(var(--border))]" />
        </div>
      </div>
      <div className="app-container space-y-6 py-5 sm:py-8">
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-7 w-32 rounded-full bg-[rgb(var(--border)_/_0.45)]" />
          ))}
        </div>
        <div className="flex gap-1">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-9 w-24 rounded-lg bg-[rgb(var(--border)_/_0.45)]" />
          ))}
        </div>
        <div className="space-y-3">
          <div className="h-5 w-40 rounded-lg bg-[rgb(var(--border)_/_0.45)]" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-28 rounded-2xl bg-[rgb(var(--border)_/_0.45)]" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
