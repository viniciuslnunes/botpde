import { Skeleton } from '@/components/portal/feed-skeletons'

/**
 * Reserva a geometria da sala enquanto os dados e o cliente de vídeo carregam.
 * Mantém o cabeçalho e o palco estáveis sem reutilizar o skeleton do feed.
 */
export function SalaAtivaSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy
      className="space-y-6"
    >
      <span className="sr-only">Carregando sala ao vivo…</span>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-4 w-28 rounded-full" soft />
          <Skeleton className="h-7 w-72 max-w-[72vw] rounded-lg" />
          <Skeleton className="h-3.5 w-56 max-w-[64vw] rounded-full" soft />
        </div>
        <Skeleton className="h-9 w-28 rounded-xl" soft />
      </div>

      <div className="skeleton-sweep overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
        <div className="relative min-h-[420px] bg-[rgb(var(--background-subtle))] p-3">
          <div className="skeleton-track h-20 w-28 rounded-xl" />
          <div className="absolute right-3 top-3 skeleton-track-soft h-9 w-9 rounded-full" />
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[rgb(var(--border))] p-3">
          <div className="flex gap-2">
            <div className="skeleton-track-soft h-9 w-9 rounded-full" />
            <div className="skeleton-track-soft h-9 w-9 rounded-full" />
            <div className="skeleton-track-soft hidden h-9 w-28 rounded-xl sm:block" />
          </div>
          <div className="skeleton-track h-9 w-32 rounded-xl" />
        </div>
      </div>
    </div>
  )
}
