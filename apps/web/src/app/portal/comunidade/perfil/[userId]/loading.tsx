import { FeedPostSkeletonList, Skeleton } from '@/components/portal/feed-skeletons'

/**
 * Fallback do perfil. Sem isto a rota herdava o `loading.tsx` do feed (rail
 * esquerdo + stories + composer), que não existe aqui — a troca pelo conteúdo
 * real reorganizava a página inteira. A geometria abaixo espelha
 * `PerfilHeader` (banner + avatar 96px sobreposto), `PerfilStats` (3 colunas
 * divididas) e `PerfilTabs` (4 abas sobre uma borda inferior).
 */
export default function PerfilComunidadeLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy className="space-y-4">
      <span className="sr-only">Carregando o perfil…</span>

      <Skeleton className="h-4 w-28 rounded-full" soft />

      {/* Cabeçalho: banner, avatar sobreposto, nome/@/torcida, selo e ações. */}
      <section
        aria-hidden="true"
        className="skeleton-sweep card-soft overflow-hidden rounded-3xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]"
      >
        <div className="skeleton-track h-[clamp(7rem,4rem+12vw,9.875rem)] w-full" />
        <div className="flex flex-col items-center px-5 pb-5">
          <div className="-mt-12 rounded-full ring-4 ring-[rgb(var(--surface))] sm:-mt-14">
            <div className="skeleton-track h-20 w-20 rounded-full sm:h-24 sm:w-24" />
          </div>
          <div className="skeleton-track mt-3 h-6 w-48 rounded-full" />
          <div className="skeleton-track-soft mt-2 h-3.5 w-24 rounded-full" />
          <div className="skeleton-track-soft mt-2 h-3 w-20 rounded-full" />
          <div className="skeleton-track-soft mt-3 h-5 w-28 rounded-full" />
          <div className="mt-4 flex w-full max-w-sm items-center justify-center gap-2">
            <div className="skeleton-track-soft h-9 w-24 rounded-full" />
            <div className="skeleton-track-soft h-9 w-36 rounded-full" />
          </div>
        </div>
      </section>

      {/* Contadores: publicações / seguidores / seguindo. */}
      <div
        aria-hidden="true"
        className="skeleton-sweep card-soft flex items-stretch divide-x divide-[rgb(var(--border))] rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-2 py-3"
      >
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1.5 py-1">
            <div className="skeleton-track h-5 w-8 rounded-full" />
            <div className="skeleton-track-soft h-3 w-16 rounded-full" />
          </div>
        ))}
      </div>

      {/* Abas. */}
      <div
        aria-hidden="true"
        className="flex gap-6 border-b border-[rgb(var(--border))] px-1 pb-3 pt-1"
      >
        {['w-12', 'w-20', 'w-12', 'w-16'].map((w, i) => (
          <div key={i} className={`skeleton-track-soft h-3.5 rounded-full ${w}`} />
        ))}
      </div>

      {/* Aba padrão: publicações do autor. */}
      <FeedPostSkeletonList count={2} />
    </div>
  )
}
