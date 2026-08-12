'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { PostSocialItem } from '@/lib/feed'
import { FeedPostCard } from '@/components/portal/feed-post-card'
import { MotionRevealOnce } from '@/components/motion/motion-reveal-once'
import { OptimisticHighlight } from '@/components/motion/optimistic-highlight'
import { ComunidadeFeedEmpty } from './comunidade-feed-empty'
import { FeedRefreshIndicator } from './feed-refresh-indicator'
import { FeedLoadMore } from './feed-load-more'
import { FeedPostSkeletonList } from '@/components/portal/feed-skeletons'
import { useFeedStream } from '@/lib/use-feed-stream'
import { useComunidadeInfiniteFeed } from '@/lib/use-comunidade-infinite-feed'
import { useFeedWindow } from '@/lib/use-feed-window'
import { useFeedPullRefresh } from '@/lib/use-feed-pull-refresh'
import {
  COMUNIDADE_FEED_REFRESH_TOPO_EVENT,
  COMUNIDADE_POST_EXCLUIDO_EVENT,
  COMUNIDADE_POST_PUBLICADO_EVENT,
  FEED_SSE_DEBOUNCE_MS,
  feedStreamEndpoint,
  isComunidadeFeedNearTop,
  previewParaPostSocial,
  deveExibirBadgeTorcidaNoFeed,
  type PostExcluidoEventDetail,
  type PostPublicadoEventDetail,
} from '@/lib/feed-live-refresh'
import type { EscopoComunidade } from '@/lib/comunidade-escopo'
import { useLatestRef } from '@/lib/use-latest-ref'

interface CurrentUser {
  id: string
  nome: string | null
  avatarUrl: string | null
}

interface PageInfo {
  hasMore: boolean
  nextCursor: string | null
}

type Filtro = 'descobrir' | 'seguindo' | 'grupos' | 'canal'

function filtroAceitaPublicacao(
  filtro: Filtro,
  filtroAlvo?: PostPublicadoEventDetail['filtroAlvo'],
): boolean {
  return filtro === (filtroAlvo ?? 'descobrir')
}

export function ComunidadeFeedInfinite({
  tenantId,
  currentUser,
  filtro,
  conversaId,
  escopo,
  afiliacaoId,
  incluirFeedInterno = false,
  initialPosts,
  initialPageInfo,
  initialCursor,
  salvoIds,
  seedFromSsr = true,
  podeCompartilhar = true,
}: {
  tenantId: string
  currentUser: CurrentUser
  filtro: Filtro
  conversaId?: string
  escopo?: EscopoComunidade
  afiliacaoId?: string
  /** Minha torcida/unidade: pede `feedInterno=1` na API. Soft-switch omite. */
  incluirFeedInterno?: boolean
  initialPosts: PostSocialItem[]
  initialPageInfo: PageInfo
  initialCursor: string | null
  salvoIds: string[]
  seedFromSsr?: boolean
  podeCompartilhar?: boolean
}) {
  const salvoSet = useMemo(() => new Set<string>(salvoIds), [salvoIds])
  const isNacional = escopo === 'nacional'

  const streamEndpoint = useMemo(
    () =>
      feedStreamEndpoint(
        isNacional && afiliacaoId ? { escopo: 'nacional', afiliacaoId } : undefined,
      ),
    [afiliacaoId, isNacional],
  )

  const {
    posts,
    pageInfo,
    loadingMore,
    loadingInicial,
    error,
    loadMore,
    refreshCurrentPage,
    prependPost,
    replacePost,
    removePost,
  } = useComunidadeInfiniteFeed<PostSocialItem>({
    endpoint: '/api/comunidade/feed',
    tenantId,
    viewerId: currentUser.id,
    filtro,
    conversaId,
    escopo,
    afiliacaoId,
    feedInterno: incluirFeedInterno,
    initialPosts,
    initialPageInfo,
    initialCursor,
    seedFromSsr,
  })

  const listRef = useRef<HTMLDivElement | null>(null)
  const windowing = useFeedWindow(posts.length, { listRef })
  const refreshDebounceRef = useRef<number | null>(null)
  const seenIds = useRef<Set<string>>(new Set())

  const refreshTopo = useCallback(async () => {
    await refreshCurrentPage(null)
  }, [refreshCurrentPage])

  const { pullProgress, isPullRefreshing, triggerRefresh } = useFeedPullRefresh(refreshTopo)

  const showRefreshIndicator = isPullRefreshing || pullProgress > 0.08

  useFeedStream(() => {
    if (!isComunidadeFeedNearTop()) return
    if (refreshDebounceRef.current) window.clearTimeout(refreshDebounceRef.current)
    refreshDebounceRef.current = window.setTimeout(() => {
      void refreshCurrentPage(null)
    }, FEED_SSE_DEBOUNCE_MS)
  }, streamEndpoint)

  useEffect(() => {
    function onRefreshTopo() {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      void triggerRefresh()
    }
    window.addEventListener(COMUNIDADE_FEED_REFRESH_TOPO_EVENT, onRefreshTopo)
    return () => window.removeEventListener(COMUNIDADE_FEED_REFRESH_TOPO_EVENT, onRefreshTopo)
  }, [triggerRefresh])

  useEffect(() => {
    function onPostPublicado(ev: Event) {
      const detail = (ev as CustomEvent<PostPublicadoEventDetail>).detail
      if (!detail) return

      if (detail.removerId) {
        removePost(detail.removerId)
        return
      }

      if (!filtroAceitaPublicacao(filtro, detail.filtroAlvo)) return

      if (detail.preview) {
        const item = previewParaPostSocial(detail.preview)
        if (detail.substituirId) {
          replacePost(detail.substituirId, item)
        } else {
          prependPost(item)
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }
      }
    }

    function onPostExcluido(ev: Event) {
      const detail = (ev as CustomEvent<PostExcluidoEventDetail>).detail
      if (detail?.postId) removePost(detail.postId)
    }

    window.addEventListener(COMUNIDADE_POST_PUBLICADO_EVENT, onPostPublicado)
    window.addEventListener(COMUNIDADE_POST_EXCLUIDO_EVENT, onPostExcluido)
    return () => {
      window.removeEventListener(COMUNIDADE_POST_PUBLICADO_EVENT, onPostPublicado)
      window.removeEventListener(COMUNIDADE_POST_EXCLUIDO_EVENT, onPostExcluido)
    }
  }, [filtro, prependPost, removePost, replacePost])

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
  // Ref estável: recriar o observer a cada mudança de `loadMore` abortava
  // fetches em voo e deixava o skeleton "Carregando mais…" preso.
  const loadMoreRef = useLatestRef(loadMore)

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return

    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries.some((x) => x.isIntersecting)) return
        void loadMoreRef.current()
      },
      { root: null, rootMargin: '300px' },
    )

    obs.observe(el)
    return () => obs.disconnect()
  }, [loadMoreRef])

  return (
    <>
      <FeedRefreshIndicator
        visible={pullProgress > 0.08}
        refreshing={isPullRefreshing}
        pullProgress={pullProgress}
      />

      <section id="comunidade-feed-posts">
        {posts.length === 0 && loadingInicial ? (
          <div role="status" aria-live="polite" aria-busy>
            <span className="sr-only">Carregando publicações…</span>
            <FeedPostSkeletonList count={3} />
          </div>
        ) : posts.length === 0 && !showRefreshIndicator && !error ? (
          <ComunidadeFeedEmpty filtro={filtro} nacional={isNacional} />
        ) : (
          <div
            ref={listRef}
            className="relative w-full"
            style={windowing.enabled ? { height: windowing.totalSize } : undefined}
          >
            {renderizaveis.map(({ index, offset }) => {
              const post = posts[index]
              if (!post) return null
              const otimista = String(post.id).startsWith('optimistic-')
              return (
                <div
                  key={post.id}
                  data-index={index}
                  ref={windowing.measureElement}
                  className={
                    offset === null
                      ? 'w-full pb-4'
                      : 'absolute left-0 top-0 w-full pb-4'
                  }
                  style={offset === null ? undefined : { transform: `translateY(${offset}px)` }}
                >
                  <MotionRevealOnce id={post.id} index={index} seenIds={seenIds}>
                    <OptimisticHighlight active={otimista}>
                      <div className={windowing.postClassName}>
                        <FeedPostCard
                          post={post}
                          showTenantBadge={deveExibirBadgeTorcidaNoFeed({
                            postTenantId: post.tenantId,
                            viewerTenantId: tenantId,
                            visibilidade: post.visibilidade,
                            escopoNacional: isNacional,
                          })}
                          currentUser={currentUser}
                          salvo={salvoSet.has(post.id)}
                          podeCompartilhar={podeCompartilhar}
                        />
                      </div>
                    </OptimisticHighlight>
                  </MotionRevealOnce>
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
