export default function MensagensLoading() {
  return (
    <div className="animate-pulse">
      <div className="h-[calc(100vh-8.5rem)] min-h-[24rem] rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
        <div className="flex h-full">
          <div className="w-full space-y-3 border-r border-[rgb(var(--border))] p-4 md:w-80">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-10 w-10 shrink-0 rounded-full bg-[rgb(var(--border))]" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-24 rounded bg-[rgb(var(--border))]" />
                  <div className="h-2 w-full rounded bg-[rgb(var(--border))]" />
                </div>
              </div>
            ))}
          </div>
          <div className="hidden flex-1 p-6 md:block">
            <div className="mx-auto h-8 w-40 rounded bg-[rgb(var(--border))]" />
          </div>
        </div>
      </div>
    </div>
  )
}
