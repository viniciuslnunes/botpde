import {
  FeedComposerSkeleton,
  FeedPostSkeletonList,
  FeedStoriesSkeleton,
  Skeleton,
} from '@/components/portal/feed-skeletons'

/**
 * A grade tem que ser a mesma da `page.tsx` (rail esq. + conteúdo). O rail
 * direito de salas/chat vive no `ComunidadeLayoutChrome`, que já envolve este
 * fallback e reserva as 20rem da coluna — repeti-la aqui esmagaria o feed e
 * abriria um vão morto ao lado do rail real.
 */
export default function ComunidadeLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy
      className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]"
    >
      <span className="sr-only">Carregando a comunidade…</span>

      <aside className="hidden space-y-4 lg:block">
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-32 rounded-2xl" soft />
      </aside>

      <main className="min-w-0 flex flex-col gap-4">
        <Skeleton className="h-11 rounded-xl" soft />
        <FeedStoriesSkeleton />
        <div className="flex flex-col gap-6">
          <FeedComposerSkeleton />
          <FeedPostSkeletonList count={3} />
        </div>
      </main>
    </div>
  )
}
