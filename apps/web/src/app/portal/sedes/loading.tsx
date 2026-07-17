export default function SedesLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div>
        <div className="h-8 w-24 rounded-lg bg-[rgb(var(--border))]" />
        <div className="mt-2 h-4 w-80 max-w-full rounded bg-[rgb(var(--border))]" />
      </div>
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-5">
        <div className="space-y-2">
          <div className="h-10 rounded-xl bg-[rgb(var(--border))]" />
          <div className="flex gap-1.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-7 w-16 rounded-lg bg-[rgb(var(--border))]" />
            ))}
          </div>
          <div className="h-8 w-36 rounded-lg bg-[rgb(var(--border))]" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex overflow-hidden rounded-xl border border-[rgb(var(--border))]">
              <div className="h-[5.25rem] w-[5.75rem] shrink-0 bg-[rgb(var(--border))]" />
              <div className="flex flex-1 items-center justify-between gap-2 p-3">
                <div className="flex flex-1 flex-col gap-2">
                  <div className="h-3 w-14 rounded bg-[rgb(var(--border))]" />
                  <div className="h-4 w-40 rounded bg-[rgb(var(--border))]" />
                  <div className="h-3 w-56 max-w-full rounded bg-[rgb(var(--border))]" />
                </div>
                <div className="h-10 w-12 rounded-lg bg-[rgb(var(--border))]" />
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-4">
          <div className="h-[14rem] rounded-xl bg-[rgb(var(--border))] sm:h-[18rem] lg:h-[22rem]" />
          <div className="h-48 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--border))]/40" />
        </div>
      </div>
    </div>
  )
}
