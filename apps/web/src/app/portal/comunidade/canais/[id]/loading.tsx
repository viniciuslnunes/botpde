import { FeedComposerSkeleton, FeedPostSkeletonList, Skeleton } from '@/components/portal/feed-skeletons'

/**
 * Cold path (listagem → canal). Soft-switch temático ↔ temático não passa por
 * aqui (`history.pushState`). Só o painel central — o rail esquerdo do shell
 * já está no layout/chrome e o esqueleto de aside gerava flash desnecessário.
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

      <aside className="hidden lg:block" aria-hidden />

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
