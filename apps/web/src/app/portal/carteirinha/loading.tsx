export default function CarteirinhaLoading() {
  return (
    <div className="mx-auto max-w-3xl animate-pulse space-y-6 px-1 pb-8 sm:px-0">
      <div className="h-8 w-52 rounded bg-[rgb(var(--border))]" />
      <div className="flex gap-2">
        <div className="h-9 w-36 rounded-lg bg-[rgb(var(--border))]" />
        <div className="h-9 w-40 rounded-lg bg-[rgb(var(--border))]" />
      </div>
      <div className="mx-auto aspect-[1.586/1] w-full max-w-lg rounded-2xl bg-[rgb(var(--border))]" />
    </div>
  )
}
