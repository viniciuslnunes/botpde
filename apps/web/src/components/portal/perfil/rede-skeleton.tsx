import { Skeleton } from '@/components/portal/feed-skeletons'

/**
 * Fallback das listas de rede (`/perfil/[userId]/seguidores` e `/seguindo`).
 * Existe para essas rotas não herdarem o skeleton do perfil (banner + abas),
 * que não corresponde à página: voltar ao perfil, título e linhas de membro.
 */
export function RedeSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy className="space-y-4">
      <span className="sr-only">{label}</span>

      <Skeleton className="h-4 w-32 rounded-full" soft />
      <Skeleton className="h-6 w-64 rounded-full" />

      <div
        aria-hidden="true"
        className="skeleton-sweep card-soft divide-y divide-[rgb(var(--border))] rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]"
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <div className="skeleton-track h-10 w-10 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="skeleton-track h-3.5 w-[38%] rounded-full" />
              <div className="skeleton-track-soft h-3 w-[24%] rounded-full" />
            </div>
            <div className="skeleton-track-soft h-8 w-24 shrink-0 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
