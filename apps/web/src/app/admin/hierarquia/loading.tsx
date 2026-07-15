export default function HierarquiaLoading() {
  return (
    <div className="app-container animate-pulse space-y-6 py-8">
      <div className="mx-auto h-8 w-56 rounded-lg bg-[rgb(var(--border))]" />
      <div className="flex flex-col items-center gap-4">
        <div className="h-14 w-44 rounded-xl bg-[rgb(var(--border)_/_0.45)]" />
        <div className="h-6 w-16 rounded bg-[rgb(var(--border)_/_0.35)]" />
        <div className="h-14 w-44 rounded-xl bg-[rgb(var(--border)_/_0.45)]" />
        <div className="h-6 w-16 rounded bg-[rgb(var(--border)_/_0.35)]" />
        <div className="grid w-full max-w-4xl grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-36 rounded-2xl bg-[rgb(var(--border)_/_0.4)]" />
          ))}
        </div>
      </div>
    </div>
  )
}
