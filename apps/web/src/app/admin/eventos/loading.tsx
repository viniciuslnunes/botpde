export default function EventosLoading() {
  return (
    <div className="app-container animate-pulse space-y-6 py-8">
      <div className="h-8 w-48 rounded-lg bg-[rgb(var(--border))]" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-40 rounded-2xl bg-[rgb(var(--border)_/_0.45)]" />
        ))}
      </div>
    </div>
  )
}
