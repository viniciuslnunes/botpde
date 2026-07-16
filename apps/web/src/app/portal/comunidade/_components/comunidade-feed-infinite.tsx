'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { PostSocialItem } from '@/lib/feed'
import { FeedPostCard } from '@/components/portal/feed-post-card'
import { MotionReveal } from '@/components/motion/motion-reveal'
import { ComunidadeFeedEmpty } from './comunidade-feed-empty'
import { useFeedStream } from '@/lib/use-feed-stream'
import { useComunidadeInfiniteFeed } from '@/lib/use-comunidade-infinite-feed'
import { useFeedWindow } from '@/lib/use-feed-window'
import { FEED_SSE_DEBOUNCE_MS, isComunidadeFeedNearTop } from '@/lib/feed-live-refresh'

interface CurrentUser {
  id: string
  nome: string | null
  avatarUrl: string | null
}

interface PageInfo {
  hasMore: boolean
  nextCursor: string | null
}

type Filtro = 'descobrir' | 'seguindo'

export function ComunidadeFeedInfinite({
  tenantId,
  currentUser,
  filtro,
  initialPosts,
  initialPageInfo,
  initialCursor,
  salvoIds,
}: {
  tenantId: string
  currentUser: CurrentUser
  filtro: Filtro
  initialPosts: PostSocialItem[]
  initialPageInfo: PageInfo
  initialCursor: string | null
  salvoIds: string[]
}) {
  const salvoSet = useMemo(() => new Set<string>(salvoIds), [salvoIds])

  const {
    posts,
    pageInfo,
    loadingMore,
    error,
    loadMore,
    refreshCurrentPage,
  } = useComunidadeInfiniteFeed<PostSocialItem>({
    endpoint: '/api/comunidade/feed',
    tenantId,
    viewerId: currentUser.id,
    filtro,
    initialPosts,
    initialPageInfo,
    initialCursor,
  })

  const windowing = useFeedWindow(posts.length)

  const refreshDebounceRef = useRef<number | null>(null)

  const replaceUrlCursor = useCallback(
    (nextCursor: string) => {
      const url = new URL(window.location.href)
      url.searchParams.set('cursor', nextCursor)
      if (filtro === 'seguindo') url.searchParams.set('filtro', 'seguindo')
      else url.searchParams.delete('filtro')
      window.history.replaceState({}, '', url.toString())
    },
    [filtro],
  )

  const loadMoreWithDeeplink = useCallback(async () => {
    const cursor = await loadMore()
    if (typeof cursor === 'string') replaceUrlCursor(cursor)
  }, [loadMore, replaceUrlCursor])

  useFeedStream(() => {
    // Longe do topo: banner pede clique — evita saltar a lista no meio da leitura.
    if (!isComunidadeFeedNearTop()) return
    if (refreshDebounceRef.current) window.clearTimeout(refreshDebounceRef.current)
    refreshDebounceRef.current = window.setTimeout(() => {
      void refreshCurrentPage(initialCursor)
    }, FEED_SSE_DEBOUNCE_MS)
  })

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
      <section className="space-y-4">
        {posts.length === 0 ? (
          <ComunidadeFeedEmpty filtro={filtro} />
        ) : windowing.enabled && windowing.virtualItems ? (
          <div className="relative w-full" style={{ height: windowing.totalSize }}>
            {windowing.virtualItems.map((item) => {
              const post = posts[item.index]
              if (!post) return null
              return (
                <div
                  key={post.id}
                  data-index={item.index}
                  ref={windowing.measureElement}
                  className="absolute left-0 top-0 w-full pb-4"
                  style={{ transform: `translateY(${item.start}px)` }}
                >
                  <MotionReveal index={item.index}>
                    <div className="feed-post-window">
                      <FeedPostCard
                        post={post}
                        showTenantBadge={post.tenantId !== tenantId}
                        currentUser={currentUser}
                        salvo={salvoSet.has(post.id)}
                      />
                    </div>
                  </MotionReveal>
                </div>
              )
            })}
          </div>
        ) : (
          posts.map((post, index) => (
            <MotionReveal key={post.id} index={index}>
              <div className="feed-post-window">
                <FeedPostCard
                  post={post}
                  showTenantBadge={post.tenantId !== tenantId}
                  currentUser={currentUser}
                  salvo={salvoSet.has(post.id)}
                />
              </div>
            </MotionReveal>
          ))
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
            <div className="h-10 w-40 animate-pulse rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface))]" />
          )}
        </div>
      ) : null}
    </>
  )
}
