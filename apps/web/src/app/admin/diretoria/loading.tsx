export default function DiretoriaLoading() {
  return (
    <div className="app-container animate-pulse space-y-6 py-8">
      <div className="flex justify-between gap-4">
        <div className="space-y-2">
          <div className="h-8 w-40 rounded-lg bg-[rgb(var(--border))]" />
          <div className="h-4 w-80 rounded bg-[rgb(var(--border))]" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-2xl bg-[rgb(var(--border)_/_0.45)]" />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-[rgb(var(--border)_/_0.45)]" />
        ))}
      </div>
    </div>
  )
}
