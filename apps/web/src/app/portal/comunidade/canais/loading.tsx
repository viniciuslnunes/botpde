import type { CSSProperties } from 'react'

/**
 * Placeholder da listagem de canais. O `loading.tsx` do segmento
 * `/portal/comunidade` desenha o feed (stories/composer/posts) e não serve
 * aqui: esta rota é header + filtros + grade de cards sem rail lateral.
 */

function estiloIndice(index: number): CSSProperties {
  return { '--i': index } as CSSProperties
}

function CanalCardSkeleton({ index }: { index: number }) {
  return (
    <div
      aria-hidden="true"
      style={estiloIndice(index)}
      className="skeleton-sweep card-soft rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4"
    >
      <div className="flex items-start gap-3">
        <div className="skeleton-track h-20 w-20 shrink-0 rounded-xl sm:h-24 sm:w-24" />

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-1.5">
            <div className="skeleton-track-soft h-4 w-16 rounded-md" />
            <div className="skeleton-track-soft h-4 w-10 rounded-md" />
          </div>
          <div className="skeleton-track h-3.5 w-[80%] rounded-full" />
          <div className="skeleton-track-soft h-3 w-[52%] rounded-full" />
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <div className="skeleton-track-soft h-3 w-[92%] rounded-full" />
        <div className="skeleton-track-soft h-3 w-[64%] rounded-full" />
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="skeleton-track-soft h-3 w-28 rounded-full" />
        <div className="skeleton-track-soft h-3 w-10 rounded-full" />
      </div>

      <div className="skeleton-track mt-3 h-9 w-full rounded-lg" />
    </div>
  )
}

export default function CanaisLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy className="space-y-5">
      <span className="sr-only">Carregando canais…</span>

      <header aria-hidden="true" className="flex items-center gap-3">
        <div className="skeleton-track-soft h-10 w-10 shrink-0 rounded-full" />
        <div className="skeleton-track h-11 w-11 shrink-0 rounded-2xl" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="skeleton-track h-6 w-32 rounded-full" />
          <div className="skeleton-track-soft h-3.5 w-[min(28rem,80%)] rounded-full" />
        </div>
      </header>

      <div aria-hidden="true" className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="skeleton-track-soft h-10 min-w-0 flex-1 rounded-xl" />
          <div className="flex shrink-0 items-center gap-2">
            <div className="skeleton-track-soft h-10 w-[7.5rem] rounded-xl" />
            <div className="skeleton-track h-10 w-[7.5rem] rounded-xl" />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {[16, 14, 16, 12, 20].map((w, i) => (
            <div
              key={i}
              className="skeleton-track-soft h-7 rounded-lg"
              style={{ width: `${w * 0.25}rem` }}
            />
          ))}
          <div className="ml-auto flex items-center gap-2">
            <div className="skeleton-track-soft h-8 w-[4.5rem] rounded-lg" />
            <div className="skeleton-track-soft h-8 w-[7rem] rounded-lg" />
            <div className="skeleton-track-soft h-8 w-[6rem] rounded-lg" />
          </div>
        </div>

        <div className="skeleton-track-soft h-3 w-20 rounded-full" />
      </div>

      <section className="space-y-3">
        <div aria-hidden="true" className="skeleton-track-soft h-3 w-28 rounded-full" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-3.5 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <CanalCardSkeleton key={i} index={i} />
          ))}
        </div>
      </section>
    </div>
  )
}
