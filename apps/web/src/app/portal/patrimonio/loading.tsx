export default function PatrimonioLoading() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse space-y-6">
      <div className="space-y-3 border-b border-[rgb(var(--border))] pb-6">
        <div className="h-3 w-28 rounded bg-[rgb(var(--border))]" />
        <div className="h-8 w-48 rounded-lg bg-[rgb(var(--border))]" />
        <div className="h-4 w-72 max-w-full rounded bg-[rgb(var(--border))]" />
      </div>
      <div className="space-y-3 rounded-2xl border border-[rgb(var(--border))] p-3">
        <div className="h-9 w-full max-w-md rounded-lg bg-[rgb(var(--border))]" />
        <div className="h-10 w-full rounded-lg bg-[rgb(var(--border))]" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 rounded-2xl border border-[rgb(var(--border))]" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="aspect-[4/5] rounded-xl border border-[rgb(var(--border))]" />
        ))}
      </div>
    </div>
  )
}
