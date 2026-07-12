import { LojaProdutoGridSkeleton } from '@/components/portal/loja-produto-skeleton'

export default function LojaLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-28 rounded-2xl bg-[rgb(var(--border)_/_0.5)]" />
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-8 w-20 rounded-full bg-[rgb(var(--border))]" />
        ))}
      </div>
      <LojaProdutoGridSkeleton count={6} />
    </div>
  )
}
