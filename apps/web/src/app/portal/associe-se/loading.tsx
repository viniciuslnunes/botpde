export default function AssocieSeLoading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 w-48 rounded-lg bg-[rgb(var(--background-subtle))]" />
      <div className="h-4 w-full max-w-md rounded bg-[rgb(var(--background-subtle))]" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="h-56 rounded-2xl bg-[rgb(var(--background-subtle))]" />
        <div className="h-56 rounded-2xl bg-[rgb(var(--background-subtle))]" />
        <div className="h-56 rounded-2xl bg-[rgb(var(--background-subtle))]" />
      </div>
    </div>
  )
}
