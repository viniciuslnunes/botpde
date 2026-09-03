'use client'

import { useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import type { PostSocialItem } from '@/lib/feed'
import { FeedPostCard } from '@/components/portal/feed-post-card'
import { MotionReveal } from '@/components/motion/motion-reveal'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { FeedPostSkeletonList } from '@/components/portal/feed-skeletons'
import { FeedLoadMore } from './feed-load-more'
import { Users } from 'lucide-react'
import { useFeedStream } from '@/lib/use-feed-stream'
import { useComunidadeInfiniteFeed } from '@/lib/use-comunidade-infinite-feed'
import { useFeedWindow } from '@/lib/use-feed-window'
import { deveExibirBadgeTorcidaNoFeed } from '@/lib/feed-live-refresh'
import { useLatestRef } from '@/lib/use-latest-ref'
import { ComunidadeQueryProvider } from '@/components/portal/comunidade-query-provider'
import {
  COMUNIDADE_POST_EXCLUIDO_EVENT,
  FEED_SSE_DEBOUNCE_MS,
  isComunidadeFeedNearTop,
  type PostExcluidoEventDetail,
} from '@/lib/feed-live-refresh'

interface CurrentUser {
  id: string
  nome: string | null
  avatarUrl: string | null
}

interface PageInfo {
  hasMore: boolean
  nextCursor: string | null
}

type ComunidadeRedeInfiniteProps = {
  tenantId: string
  currentUser: CurrentUser
  initialPosts: PostSocialItem[]
  initialPageInfo: PageInfo
  initialCursor: string | null
  salvoIds: string[]
  contextoComunidadeNome?: string | null
}

export function ComunidadeRedeInfinite(props: ComunidadeRedeInfiniteProps) {
  return (
    <ComunidadeQueryProvider>
      <ComunidadeRedeInfiniteView {...props} />
    </ComunidadeQueryProvider>
  )
}

function ComunidadeRedeInfiniteView({
  tenantId,
  currentUser,
  initialPosts,
  initialPageInfo,
  initialCursor,
  salvoIds,
  contextoComunidadeNome = null,
}: ComunidadeRedeInfiniteProps) {
  const salvoSet = useMemo(() => new Set<string>(salvoIds), [salvoIds])

  const {
    posts,
    pageInfo,
    loadingMore,
    loadingInicial,
    error,
    loadMore,
    refreshCurrentPage,
    removePost,
  } = useComunidadeInfiniteFeed<PostSocialItem>({
    endpoint: '/api/comunidade/rede',
    tenantId,
    viewerId: currentUser.id,
    initialPosts,
    initialPageInfo,
    initialCursor,
  })

  const listRef = useRef<HTMLDivElement | null>(null)
  const windowing = useFeedWindow(posts.length, { listRef })

  const refreshDebounceRef = useRef<number | null>(null)

  useFeedStream(() => {
    if (!isComunidadeFeedNearTop()) return
    if (refreshDebounceRef.current) window.clearTimeout(refreshDebounceRef.current)
    refreshDebounceRef.current = window.setTimeout(() => {
      void refreshCurrentPage(initialCursor)
    }, FEED_SSE_DEBOUNCE_MS)
  })

  useEffect(() => {
    function onPostExcluido(ev: Event) {
      const detail = (ev as CustomEvent<PostExcluidoEventDetail>).detail
      if (detail?.postId) removePost(detail.postId)
    }
    window.addEventListener(COMUNIDADE_POST_EXCLUIDO_EVENT, onPostExcluido)
    return () => window.removeEventListener(COMUNIDADE_POST_EXCLUIDO_EVENT, onPostExcluido)
  }, [removePost])

  // Mesma marcação nos dois modos (só muda o posicionamento) — as alturas
  // medidas em fluxo normal continuam válidas quando a virtualização liga.
  const renderizaveis = useMemo(
    () =>
      windowing.enabled && windowing.virtualItems
        ? windowing.virtualItems.map((item) => ({
            index: item.index,
            offset: item.start - windowing.scrollMargin,
          }))
        : posts.map((_, index) => ({ index, offset: null })),
    [posts, windowing.enabled, windowing.virtualItems, windowing.scrollMargin],
  )

  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const loadMoreRef = useLatestRef(loadMore)

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    // Ver comunidade-feed-infinite: IO só notifica transição; re-observar
    // quando hasMore/tamanho mudam evita trava com sentinel já intersectando.
    if (!pageInfo.hasMore) return

    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries.some((x) => x.isIntersecting)) return
        void loadMoreRef.current()
      },
      { root: null, rootMargin: '300px' },
    )

    obs.observe(el)
    return () => obs.disconnect()
  }, [loadMoreRef, pageInfo.hasMore, posts.length])

  // Um único retorno: o rodapé é dono da sentinela do observer e precisa ficar
  // montado em todos os estados, senão a paginação não volta depois do vazio.
  return (
    <>
      <section>
        {posts.length === 0 && loadingInicial ? (
          <div role="status" aria-live="polite" aria-busy>
            <span className="sr-only">Carregando a atividade da sua rede…</span>
            <FeedPostSkeletonList count={3} label="Carregando sua rede…" />
          </div>
        ) : posts.length === 0 && !error ? (
          <MotionEmptyState
            icon={<Users className="mb-3 h-9 w-9 text-[rgb(var(--foreground-muted))]" />}
            title="Sua rede ainda está vazia"
            description={
              <>
                Siga outros membros ou publique algo para ver atividade aqui.{' '}
                <Link
                  href="/portal/comunidade/busca"
                  className="mt-4 inline-block rounded-full bg-[rgb(var(--primary))] px-5 py-2 text-sm font-semibold text-primary-on shadow-sm shadow-[rgb(var(--primary)_/_0.3)] transition-opacity hover:opacity-90"
                >
                  Buscar membros
                </Link>
              </>
            }
          />
        ) : (
          <div
            ref={listRef}
            className="relative w-full"
            style={windowing.enabled ? { height: windowing.totalSize } : undefined}
          >
            {renderizaveis.map(({ index, offset }) => {
              const post = posts[index]
              if (!post) return null
              return (
                <div
                  key={post.id}
                  data-index={index}
                  ref={windowing.measureElement}
                  className={offset === null ? 'w-full pb-4' : 'absolute left-0 top-0 w-full pb-4'}
                  style={offset === null ? undefined : { transform: `translateY(${offset}px)` }}
                >
                  <MotionReveal index={index}>
                    <div className={windowing.postClassName}>
                      <FeedPostCard
                        post={post}
                        currentUser={currentUser}
                        salvo={salvoSet.has(post.id)}
                        showTenantBadge={deveExibirBadgeTorcidaNoFeed({
                          postTenantId: post.tenantId,
                          viewerTenantId: tenantId,
                          visibilidade: post.visibilidade,
                        })}
                        contextoComunidadeNome={contextoComunidadeNome}
                      />
                    </div>
                  </MotionReveal>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <FeedLoadMore
        sentinelRef={sentinelRef}
        hasMore={pageInfo.hasMore}
        loading={loadingMore}
        error={error}
        onRetry={() => void loadMore()}
        temConteudo={posts.length > 0}
      />
    </>
  )
}
