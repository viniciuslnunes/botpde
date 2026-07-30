export default function AuditoriaLoading() {
  return (
    <div className="app-container animate-pulse space-y-6 py-8">
      <div className="h-8 w-48 rounded-lg bg-[rgb(var(--border))]" />
      <div className="h-4 w-full max-w-lg rounded bg-[rgb(var(--border)_/_0.45)]" />
      <div className="h-10 w-full max-w-md rounded-xl bg-[rgb(var(--border)_/_0.45)]" />
      <div className="overflow-hidden rounded-2xl border border-[rgb(var(--border))]">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="h-14 border-b border-[rgb(var(--border)_/_0.6)] bg-[rgb(var(--border)_/_0.35)] last:border-b-0"
          />
        ))}
      </div>
    </div>
  )
}
