export default function SedesLoading() {
  return (
    <div className="animate-pulse space-y-8">
      <div>
        <div className="h-8 w-24 rounded-lg bg-[rgb(var(--border))]" />
        <div className="mt-2 h-4 w-72 rounded bg-[rgb(var(--border))]" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-[rgb(var(--border))] p-5">
            <div className="flex items-center gap-2">
              <div className="h-5 w-16 rounded-full bg-[rgb(var(--border))]" />
              <div className="h-5 w-48 rounded bg-[rgb(var(--border))]" />
            </div>
            <div className="mt-3 h-3 w-56 rounded bg-[rgb(var(--border))]" />
            <div className="mt-2 flex gap-4">
              <div className="h-3 w-24 rounded bg-[rgb(var(--border))]" />
              <div className="h-3 w-20 rounded bg-[rgb(var(--border))]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
