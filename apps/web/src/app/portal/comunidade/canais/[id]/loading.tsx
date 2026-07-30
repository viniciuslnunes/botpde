import { FeedComposerSkeleton, FeedPostSkeletonList, Skeleton } from '@/components/portal/feed-skeletons'

/**
 * O detalhe do canal usa o shell de feed (rail esq. + cabeçalho + publicações).
 * O rail direito (20rem) já é reservado pelo `ComunidadeLayoutChrome` — não
 * repetir aqui. O `loading.tsx` de `canais` desenha a listagem e cobriria
 * esta rota filha sem este arquivo.
 */
export default function CanalDetalheLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy
      className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]"
    >
      <span className="sr-only">Carregando o canal…</span>

      <aside className="hidden space-y-4 lg:block">
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-32 rounded-2xl" soft />
      </aside>

      <div className="min-w-0 space-y-4">
        <Skeleton className="h-9 w-44 rounded-full" soft />

        <div
          aria-hidden="true"
          className="skeleton-sweep card-soft flex items-center gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3"
        >
          <div className="skeleton-track h-9 w-9 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="skeleton-track h-3.5 w-[38%] rounded-full" />
            <div className="skeleton-track-soft h-3 w-[24%] rounded-full" />
          </div>
        </div>

        <FeedComposerSkeleton />
        <FeedPostSkeletonList count={3} label="Carregando publicações do canal…" />
      </div>
    </div>
  )
}
