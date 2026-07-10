/** Skeleton de card de produto — proporção alinhada ao `ProdutoCardImagem` (aspect-square). */
export function LojaProdutoCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
      <div className="aspect-square bg-[rgb(var(--border)_/_0.45)]" />
      <div className="space-y-2 p-3">
        <div className="h-4 w-[82%] rounded-md bg-[rgb(var(--border)_/_0.6)]" />
        <div className="h-4 w-[40%] rounded-md bg-[rgb(var(--border)_/_0.45)]" />
      </div>
    </div>
  )
}

export function LojaProdutoGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <LojaProdutoCardSkeleton key={i} />
      ))}
    </div>
  )
}
