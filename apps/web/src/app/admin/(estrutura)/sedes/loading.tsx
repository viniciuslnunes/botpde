export default function AdminSedesLoading() {
  return (
    <div className="app-container animate-pulse space-y-6 py-8">
      <div className="flex justify-between gap-3">
        <div>
          <div className="h-8 w-28 rounded-lg bg-[rgb(var(--border))]" />
          <div className="mt-2 h-4 w-80 max-w-full rounded bg-[rgb(var(--border))]" />
        </div>
        <div className="h-10 w-36 rounded-xl bg-[rgb(var(--border))]" />
      </div>
      <div className="h-10 rounded-xl bg-[rgb(var(--border))]" />
      <div className="flex gap-1.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-7 w-16 rounded-lg bg-[rgb(var(--border))]" />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--border))]/30" />
        ))}
      </div>
    </div>
  )
}
