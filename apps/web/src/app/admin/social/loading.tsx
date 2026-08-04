export default function SocialLoading() {
  return (
    <div className="app-container animate-pulse space-y-6 py-8">
      <div className="flex justify-between gap-4">
        <div className="space-y-2">
          <div className="h-8 w-48 rounded-lg bg-[rgb(var(--border))]" />
          <div className="h-4 w-72 rounded bg-[rgb(var(--border))]" />
        </div>
        <div className="h-10 w-36 rounded-lg bg-[rgb(var(--border))]" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-28 rounded-2xl bg-[rgb(var(--border)_/_0.45)]" />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-[rgb(var(--border)_/_0.45)]" />
        ))}
      </div>
    </div>
  )
}
