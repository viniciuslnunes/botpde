/** Skeleton do wizard — usado em `loading.tsx` e fallback de Suspense. */
export function OnboardingSkeleton() {
  return (
    <div className="flex flex-1 flex-col animate-pulse">
      <header className="mb-8">
        <div className="mb-6 flex items-center gap-2">
          <div className="h-6 w-6 rounded bg-[rgb(var(--border))]" />
          <div className="h-4 w-24 rounded bg-[rgb(var(--border))]" />
        </div>
        <div className="flex items-center gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex flex-1 flex-col gap-1.5">
              <div className="h-1.5 rounded-full bg-[rgb(var(--border))]" />
              <div className="h-3 w-12 rounded bg-[rgb(var(--border))]" />
            </div>
          ))}
        </div>
      </header>

      <div className="space-y-5">
        <div className="space-y-2">
          <div className="h-8 w-64 max-w-full rounded-lg bg-[rgb(var(--border))]" />
          <div className="h-4 w-80 max-w-full rounded bg-[rgb(var(--border))]" />
        </div>

        <div className="h-10 w-full max-w-md rounded-xl bg-[rgb(var(--border))]" />

        <div className="h-48 w-full rounded-2xl bg-[rgb(var(--border))] sm:h-56" />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-36 rounded-2xl bg-[rgb(var(--border))]" />
          ))}
        </div>
      </div>
    </div>
  )
}
