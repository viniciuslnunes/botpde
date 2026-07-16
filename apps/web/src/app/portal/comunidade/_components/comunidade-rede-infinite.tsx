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
import { useFeedWindow } from '@/lib/use-feed-window'

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
    currentCursor,
    loadingMore,
    error,
    loadMore,
    refreshCurrentPage,
  } = useComunidadeInfiniteFeed<PostSocialItem>({
    endpoint: '/api/comunidade/rede',
    tenantId,
    viewerId: currentUser.id,
    initialPosts,
    initialPageInfo,
    initialCursor,
  })

  const { start, end, topSpacer, bottomSpacer } = useFeedWindow(posts.length)

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
    if (refreshDebounceRef.current) window.clearTimeout(refreshDebounceRef.current)
    refreshDebounceRef.current = window.setTimeout(() => {
      void refreshCurrentPage(currentCursor)
    }, 800)
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

  const visiblePosts = posts.slice(start, end)

  return (
    <>
      <section className="space-y-4">
        {topSpacer > 0 ? <div aria-hidden style={{ height: topSpacer }} /> : null}
        {visiblePosts.map((post, index) => (
          <MotionReveal key={post.id} index={start + index}>
            <div className="feed-post-window">
              <FeedPostCard
                post={post}
                currentUser={currentUser}
                salvo={salvoSet.has(post.id)}
                showTenantBadge={post.tenantId !== tenantId}
              />
            </div>
          </MotionReveal>
        ))}
        {bottomSpacer > 0 ? <div aria-hidden style={{ height: bottomSpacer }} /> : null}
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
