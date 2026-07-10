export default function AdminPedidosLoading() {
  return (
    <div className="animate-pulse space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="h-9 w-20 rounded-lg bg-[rgb(var(--border))]" />
        <div className="h-7 w-28 rounded-lg bg-[rgb(var(--border))]" />
      </div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-9 w-24 rounded-lg bg-[rgb(var(--border))]" />
        ))}
      </div>
      {Array.from({ length: 2 }).map((_, i) => (
        <div
          key={i}
          className="space-y-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4"
        >
          <div className="flex justify-between gap-3">
            <div className="space-y-2">
              <div className="h-4 w-40 rounded bg-[rgb(var(--border))]" />
              <div className="h-3 w-28 rounded bg-[rgb(var(--border)_/_0.6)]" />
            </div>
            <div className="h-8 w-24 rounded-lg bg-[rgb(var(--border))]" />
          </div>
          <div className="h-10 rounded-lg bg-[rgb(var(--border)_/_0.45)]" />
          <div className="h-4 w-32 rounded bg-[rgb(var(--border))]" />
        </div>
      ))}
    </div>
  )
}
