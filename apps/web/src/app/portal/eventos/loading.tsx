export default function EventosLoading() {
  return (
    <div className="animate-pulse space-y-8">
      <div>
        <div className="h-8 w-32 rounded-lg bg-[rgb(var(--border))]" />
        <div className="mt-2 h-4 w-64 rounded bg-[rgb(var(--border))]" />
      </div>
      <div>
        <div className="mb-3 h-4 w-36 rounded bg-[rgb(var(--border))]" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-[rgb(var(--border))] p-5">
              <div className="h-5 w-3/4 rounded bg-[rgb(var(--border))]" />
              <div className="mt-3 flex gap-3">
                <div className="h-3 w-40 rounded bg-[rgb(var(--border))]" />
                <div className="h-3 w-28 rounded bg-[rgb(var(--border))]" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
