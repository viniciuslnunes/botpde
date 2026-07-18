export default function EventosLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="flex justify-between gap-4">
        <div className="space-y-2">
          <div className="h-8 w-32 rounded-lg bg-[rgb(var(--border))]" />
          <div className="h-4 w-56 rounded bg-[rgb(var(--border))]" />
        </div>
        <div className="h-10 w-28 rounded-lg bg-[rgb(var(--border))]" />
      </div>
      <div className="h-14 rounded-2xl bg-[rgb(var(--border)_/_0.45)]" />
      <div className="h-24 rounded-2xl bg-[rgb(var(--primary)_/_0.12)]" />
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl border border-[rgb(var(--border))] p-5">
            <div className="h-5 w-3/4 rounded bg-[rgb(var(--border))]" />
            <div className="mt-3 flex gap-3">
              <div className="h-3 w-40 rounded bg-[rgb(var(--border))]" />
              <div className="h-3 w-28 rounded bg-[rgb(var(--border))]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
