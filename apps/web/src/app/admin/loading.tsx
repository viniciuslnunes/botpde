export default function AdminLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-8 w-56 rounded-lg bg-[rgb(var(--border))]" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-[rgb(var(--border))]" />
        ))}
      </div>
      <div className="h-64 rounded-2xl bg-[rgb(var(--border))]" />
    </div>
  )
}
