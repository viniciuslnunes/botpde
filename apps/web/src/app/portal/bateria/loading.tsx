export default function BateriaLoading() {
  return (
    <div className="mx-auto max-w-4xl animate-pulse space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-[rgb(var(--border))]" />
        <div className="space-y-2">
          <div className="h-7 w-32 rounded-lg bg-[rgb(var(--border))]" />
          <div className="h-4 w-48 rounded bg-[rgb(var(--border))]" />
        </div>
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 rounded-xl border border-[rgb(var(--border))]" />
        ))}
      </div>
    </div>
  )
}
