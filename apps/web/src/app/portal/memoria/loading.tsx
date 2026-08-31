export default function MemoriaLoading() {
  return (
    <div className="flex min-h-[calc(100dvh-7.5rem)] animate-pulse flex-col gap-4 lg:flex-row lg:gap-8">
      <div className="space-y-3 lg:w-[13.5rem]">
        <div className="h-4 w-20 rounded bg-[rgb(var(--border))]" />
        <div className="h-8 w-40 rounded bg-[rgb(var(--border))]" />
        <div className="flex gap-1">
          <div className="h-8 w-14 rounded-full bg-[rgb(var(--border))]" />
          <div className="h-8 w-16 rounded-full bg-[rgb(var(--border))]" />
          <div className="h-8 w-20 rounded-full bg-[rgb(var(--border))]" />
        </div>
        <div className="hidden space-y-2 lg:block">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-10 rounded-xl bg-[rgb(var(--border)_/_0.45)]" />
          ))}
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-4">
        <div className="h-10 w-64 rounded bg-[rgb(var(--border))]" />
        <div className="h-36 rounded-3xl bg-[rgb(var(--primary)_/_0.12)]" />
        <div className="grid grid-cols-3 gap-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-square rounded-xl bg-[rgb(var(--border)_/_0.45)]" />
          ))}
        </div>
      </div>
    </div>
  )
}
