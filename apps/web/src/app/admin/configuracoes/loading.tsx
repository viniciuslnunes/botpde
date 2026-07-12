export default function ConfiguracoesLoading() {
  return (
    <div className="app-container animate-pulse space-y-6 py-8">
      <div className="h-8 w-48 rounded-lg bg-[rgb(var(--border))]" />
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 rounded-2xl bg-[rgb(var(--border)_/_0.45)]" />
        ))}
      </div>
    </div>
  )
}
