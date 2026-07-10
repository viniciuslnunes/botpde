export default function ComunidadeLoading() {
  return (
    <div className="grid animate-pulse gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_20rem]">
      <aside className="hidden space-y-4 lg:block">
        <div className="h-20 rounded-2xl bg-[rgb(var(--border))]" />
        <div className="h-32 rounded-2xl bg-[rgb(var(--border))]" />
      </aside>
      <main className="space-y-4">
        <div className="h-24 rounded-2xl bg-[rgb(var(--border))]" />
        <div className="h-16 rounded-2xl bg-[rgb(var(--border))]" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-36 rounded-2xl bg-[rgb(var(--border))]" />
        ))}
      </main>
      <aside className="hidden space-y-4 xl:block">
        <div className="h-40 rounded-2xl bg-[rgb(var(--border))]" />
        <div className="h-56 rounded-2xl bg-[rgb(var(--border))]" />
      </aside>
    </div>
  )
}
