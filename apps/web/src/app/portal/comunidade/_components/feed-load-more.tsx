'use client'

import type { RefObject } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { CheckCircle2, RotateCw } from 'lucide-react'
import { FeedPostSkeletonList } from '@/components/portal/feed-skeletons'
import { AppButton } from '@/components/ui/button'

interface FeedLoadMoreProps {
  /** Observado pelo IntersectionObserver do feed — envolve a área de carga. */
  sentinelRef: RefObject<HTMLDivElement | null>
  hasMore: boolean
  loading: boolean
  error: string | null
  onRetry: () => void
  /** Só marca o fim da lista quando já há posts renderizados. */
  temConteudo: boolean
}

/**
 * Rodapé do infinite scroll: placeholders enquanto a próxima página chega,
 * marca de fim da lista e recuperação de erro. Substitui o antigo "badge"
 * pulsante, que não dizia o que estava acontecendo.
 *
 * A raiz (com o `sentinelRef`) fica montada em todos os estados: se o nó saísse
 * do DOM no erro, o observer do feed não voltaria a observá-lo depois do retry
 * e a paginação morreria em silêncio. `pt-2` mantém a caixa não-vazia enquanto
 * não há nada dentro — alvo de área zero não é confiável no observer.
 */
export function FeedLoadMore({
  sentinelRef,
  hasMore,
  loading,
  error,
  onRetry,
  temConteudo,
}: FeedLoadMoreProps) {
  return (
    <div
      ref={sentinelRef}
      className="pt-2"
      role="status"
      aria-live="polite"
      aria-busy={loading}
    >
      {error ? (
        <div className="card-soft flex flex-col items-center gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-5 text-center">
          <p className="text-sm text-[rgb(var(--foreground-muted))]">{error}</p>
          <AppButton
            variant="none"
            icon={RotateCw}
            type="button"
            onClick={onRetry}
            className="app-action inline-flex items-center gap-2 rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface-raised))] px-4 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:border-[rgb(var(--border-strong))]"
          >
            Tentar de novo
          </AppButton>
        </div>
      ) : !hasMore ? (
        temConteudo ? (
          <div className="flex items-center gap-3 py-4">
            <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[rgb(var(--border))]" />
            <span className="inline-flex items-center gap-1.5 text-xs text-[rgb(var(--foreground-muted))]">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Você viu tudo por aqui
            </span>
            <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[rgb(var(--border))]" />
          </div>
        ) : null
      ) : (
        <AnimatePresence initial={false}>
          {loading && (
            <m.div
              key="feed-load-more"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.14 } }}
              transition={{ duration: 0.22, ease: [0.25, 1, 0.5, 1] }}
            >
              <span className="sr-only">Carregando mais publicações…</span>
              <FeedPostSkeletonList count={2} label="Carregando mais publicações…" />
            </m.div>
          )}
        </AnimatePresence>
      )}
    </div>
  )
}
