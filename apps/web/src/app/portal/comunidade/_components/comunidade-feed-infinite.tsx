'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { PostSocialItem } from '@/lib/feed'
import { FeedPostCard } from '@/components/portal/feed-post-card'
import { MotionRevealOnce } from '@/components/motion/motion-reveal-once'
import { OptimisticHighlight } from '@/components/motion/optimistic-highlight'
import { m } from 'motion/react'
import { ComunidadeFeedEmpty } from './comunidade-feed-empty'
import { FeedRefreshIndicator } from './feed-refresh-indicator'
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
  initialPosts,
  initialPageInfo,
  initialCursor,
  salvoIds,
  seedFromSsr = true,
}: {
  tenantId: string
  currentUser: CurrentUser
  filtro: Filtro
  conversaId?: string
  escopo?: 'nacional' | 'torcida'
  afiliacaoId?: string
  initialPosts: PostSocialItem[]
  initialPageInfo: PageInfo
  initialCursor: string | null
  salvoIds: string[]
  seedFromSsr?: boolean
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
    isRefreshing,
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
    initialPosts,
    initialPageInfo,
    initialCursor,
    seedFromSsr,
  })

  const windowing = useFeedWindow(posts.length)
  const refreshDebounceRef = useRef<number | null>(null)
  const seenIds = useRef<Set<string>>(new Set())

  const refreshTopo = useCallback(async () => {
    await refreshCurrentPage(null)
  }, [refreshCurrentPage])

  const { pullProgress, isPullRefreshing, triggerRefresh } = useFeedPullRefresh(refreshTopo)

  const showRefreshIndicator = isRefreshing || isPullRefreshing || pullProgress > 0.08

  const replaceUrlCursor = useCallback(
    (nextCursor: string) => {
      const url = new URL(window.location.href)
      url.searchParams.set('cursor', nextCursor)
      if (isNacional) {
        url.searchParams.set('escopo', 'nacional')
        if (filtro === 'seguindo') {
          url.searchParams.set('filtro', 'seguindo')
        } else if (filtro === 'grupos') {
          url.searchParams.set('filtro', 'grupos')
        } else {
          url.searchParams.delete('filtro')
        }
      } else if (filtro === 'seguindo') {
        url.searchParams.set('filtro', 'seguindo')
      } else if (filtro === 'grupos') {
        url.searchParams.set('filtro', 'grupos')
      } else {
        url.searchParams.delete('filtro')
      }
      window.history.replaceState({}, '', url.toString())
    },
    [filtro, isNacional],
  )

  const loadMoreWithDeeplink = useCallback(async () => {
    const cursor = await loadMore()
    if (typeof cursor === 'string') replaceUrlCursor(cursor)
  }, [loadMore, replaceUrlCursor])

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

      const url = new URL(window.location.href)
      if (url.searchParams.has('cursor')) {
        url.searchParams.delete('cursor')
        window.history.replaceState({}, '', url.toString())
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

  const sentinelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return

    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((x) => x.isIntersecting)
        if (!visible) return
        void loadMoreWithDeeplink()
      },
      { root: null, rootMargin: '300px' },
    )

    obs.observe(el)
    return () => obs.disconnect()
  }, [loadMoreWithDeeplink])

  return (
    <>
      <FeedRefreshIndicator
        visible={pullProgress > 0.08}
        refreshing={isRefreshing || isPullRefreshing}
        pullProgress={pullProgress}
      />

      <section id="comunidade-feed-posts" className="space-y-4">
        {posts.length === 0 && !showRefreshIndicator ? (
          <ComunidadeFeedEmpty filtro={filtro} nacional={isNacional} />
        ) : windowing.enabled && windowing.virtualItems ? (
          <div className="relative w-full" style={{ height: windowing.totalSize }}>
            {windowing.virtualItems.map((item) => {
              const post = posts[item.index]
              if (!post) return null
              const otimista = String(post.id).startsWith('optimistic-')
              return (
                <div
                  key={post.id}
                  data-index={item.index}
                  ref={windowing.measureElement}
                  className="absolute left-0 top-0 w-full pb-4"
                  style={{ transform: `translateY(${item.start}px)` }}
                >
                  <MotionRevealOnce id={post.id} index={item.index} seenIds={seenIds}>
                    <OptimisticHighlight active={otimista}>
                      <div className="feed-post-window">
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
                        />
                      </div>
                    </OptimisticHighlight>
                  </MotionRevealOnce>
                </div>
              )
            })}
          </div>
        ) : (
          posts.map((post, index) => {
            const otimista = String(post.id).startsWith('optimistic-')
            return (
              <MotionRevealOnce key={post.id} id={post.id} index={index} seenIds={seenIds}>
                <OptimisticHighlight active={otimista}>
                  <div className="feed-post-window">
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
                    />
                  </div>
                </OptimisticHighlight>
              </MotionRevealOnce>
            )
          })
        )}
      </section>

      {error && (
        <div className="pt-3 text-center text-sm text-[rgb(var(--foreground-muted))]">
          {error}
        </div>
      )}

      {pageInfo.hasMore ? (
        <div ref={sentinelRef} className="flex justify-center pt-2">
          {loadingMore && (
            <m.div
              className="h-10 w-40 rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface))]"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}
        </div>
      ) : null}
    </>
  )
}
