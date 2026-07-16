export default function PatrimonioAdminLoading() {
  return (
    <div className="mx-auto max-w-4xl animate-pulse space-y-6 px-4 py-8 sm:px-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-[rgb(var(--border))]" />
        <div className="space-y-2">
          <div className="h-6 w-36 rounded-lg bg-[rgb(var(--border))]" />
          <div className="h-4 w-64 rounded bg-[rgb(var(--border))]" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 rounded-2xl border border-[rgb(var(--border))]" />
        ))}
      </div>
      <div className="h-40 rounded-2xl border border-[rgb(var(--border))]" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-14 rounded-xl border border-[rgb(var(--border))]" />
        ))}
      </div>
    </div>
  )
}
