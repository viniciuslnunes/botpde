export default function MembrosLoading() {
  return (
    <div className="app-container animate-pulse space-y-6 py-8">
      <div className="h-8 w-48 rounded-lg bg-[rgb(var(--border))]" />
      <div className="h-10 w-full max-w-md rounded-xl bg-[rgb(var(--border)_/_0.45)]" />
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-14 rounded-xl bg-[rgb(var(--border)_/_0.45)]" />
        ))}
      </div>
    </div>
  )
}
