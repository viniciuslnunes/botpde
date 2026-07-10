export default function LojaLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-28 rounded-2xl bg-[rgb(var(--border))]" />
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-8 w-20 rounded-full bg-[rgb(var(--border))]" />
        ))}
      </div>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-72 rounded-2xl bg-[rgb(var(--border))]" />
        ))}
      </div>
    </div>
  )
}
