export default function LojaLoading() {
  return (
    <div className="animate-pulse space-y-6 p-6">
      <div className="h-8 w-48 rounded-lg bg-[rgb(var(--border))]" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-48 rounded-2xl bg-[rgb(var(--border)_/_0.45)]" />
        ))}
      </div>
    </div>
  )
}
