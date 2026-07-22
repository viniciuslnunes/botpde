'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import type { PostSocialItem } from '@/lib/feed'
import { FeedPostCard } from '@/components/portal/feed-post-card'
import { MotionReveal } from '@/components/motion/motion-reveal'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { Users } from 'lucide-react'
import { useFeedStream } from '@/lib/use-feed-stream'
import { useComunidadeInfiniteFeed } from '@/lib/use-comunidade-infinite-feed'
import { deveExibirBadgeTorcidaNoFeed } from '@/lib/feed-live-refresh'
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

export function ComunidadeRedeInfinite({
  tenantId,
  currentUser,
  initialPosts,
  initialPageInfo,
  initialCursor,
  salvoIds,
}: {
  tenantId: string
  currentUser: CurrentUser
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
    removePost,
  } = useComunidadeInfiniteFeed<PostSocialItem>({
    endpoint: '/api/comunidade/rede',
    tenantId,
    viewerId: currentUser.id,
    initialPosts,
    initialPageInfo,
    initialCursor,
  })

  const windowing = useFeedWindow(posts.length)

  const refreshDebounceRef = useRef<number | null>(null)

  const replaceUrlCursor = useCallback((nextCursor: string) => {
    const url = new URL(window.location.href)
    url.searchParams.set('cursor', nextCursor)
    window.history.replaceState({}, '', url.toString())
  }, [])

  const loadMoreWithDeeplink = useCallback(async () => {
    const cursor = await loadMore()
    if (typeof cursor === 'string') replaceUrlCursor(cursor)
  }, [loadMore, replaceUrlCursor])

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

  if (posts.length === 0) {
    return (
      <MotionEmptyState
        icon={<Users className="mb-3 h-9 w-9 text-[rgb(var(--foreground-muted))]" />}
        title="Sua rede ainda está vazia"
        description={
          <>
            Siga outros membros ou publique algo para ver atividade aqui.{' '}
            <Link
              href="/portal/comunidade/busca"
              className="mt-4 inline-block rounded-full bg-[rgb(var(--primary))] px-5 py-2 text-sm font-semibold text-white shadow-sm shadow-[rgb(var(--primary)_/_0.3)] transition-opacity hover:opacity-90"
            >
              Buscar membros
            </Link>
          </>
        }
      />
    )
  }

  return (
    <>
      <section className="space-y-4">
        {windowing.enabled && windowing.virtualItems ? (
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
                        currentUser={currentUser}
                        salvo={salvoSet.has(post.id)}
                        showTenantBadge={deveExibirBadgeTorcidaNoFeed({
                          postTenantId: post.tenantId,
                          viewerTenantId: tenantId,
                          visibilidade: post.visibilidade,
                        })}
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
                  currentUser={currentUser}
                  salvo={salvoSet.has(post.id)}
                  showTenantBadge={deveExibirBadgeTorcidaNoFeed({
                    postTenantId: post.tenantId,
                    viewerTenantId: tenantId,
                    visibilidade: post.visibilidade,
                  })}
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
