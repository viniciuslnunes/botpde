'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import type { PostSocialItem } from '@/lib/feed'
import { FeedPostCard } from '@/components/portal/feed-post-card'
import { MotionReveal } from '@/components/motion/motion-reveal'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { Users } from 'lucide-react'
import { useFeedStream } from '@/lib/use-feed-stream'

interface CurrentUser {
  id: string
  nome: string | null
  avatarUrl: string | null
}

interface PageInfo {
  hasMore: boolean
  nextCursor: string | null
}

type ApiPage = {
  posts: PostSocialItem[]
  pageInfo: PageInfo
}

const pageCache = new Map<string, ApiPage>()
const MAX_CACHED_PAGES = 12

function cacheKey(params: { tenantId: string; viewerId: string; cursor: string | null }) {
  return `${params.tenantId}:${params.viewerId}:${params.cursor ?? ''}`
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

  const [posts, setPosts] = useState<PostSocialItem[]>(initialPosts)
  const [pageInfo, setPageInfo] = useState<PageInfo>(initialPageInfo)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const loadedCursorsRef = useRef<Set<string | null>>(new Set([initialCursor]))

  // “cursor” representa o trecho atualmente exibido (por deep link). SSE deve atualizar esse trecho.
  const currentCursorRef = useRef<string | null>(initialCursor)

  const refreshLockRef = useRef(false)
  const refreshDebounceRef = useRef<number | null>(null)

  const endpointBase = '/api/comunidade/rede'

  const replaceUrlCursor = useCallback((nextCursor: string) => {
    const url = new URL(window.location.href)
    url.searchParams.set('cursor', nextCursor)
    window.history.replaceState({}, '', url.toString())
  }, [])

  const loadMore = useCallback(async () => {
    if (!pageInfo.hasMore || !pageInfo.nextCursor) return
    if (loadingMore) return
    if (loadedCursorsRef.current.has(pageInfo.nextCursor)) return

    const cursor = pageInfo.nextCursor
    loadedCursorsRef.current.add(cursor)

    const key = cacheKey({ tenantId, viewerId: currentUser.id, cursor })
    if (pageCache.has(key)) {
      const cached = pageCache.get(key)
      if (cached) {
        setPosts((prev) => {
          const existing = new Set(prev.map((p) => p.id))
          const deduped = cached.posts.filter((p) => !existing.has(p.id))
          return [...prev, ...deduped]
        })
        setPageInfo(cached.pageInfo)
      }
      return
    }

    setLoadingMore(true)
    setError(null)

    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    try {
      const url = new URL(endpointBase, window.location.origin)
      url.searchParams.set('take', '20')
      url.searchParams.set('cursor', cursor)

      const res = await fetch(url.toString(), {
        method: 'GET',
        signal: ac.signal,
        credentials: 'include',
      })

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? 'Erro ao carregar mais posts.')
      }

      const data = (await res.json()) as ApiPage

      // Deeplink: mantém na URL o cursor do trecho que acabou de entrar.
      replaceUrlCursor(cursor)

      setPosts((prev) => {
        const existing = new Set(prev.map((p) => p.id))
        const deduped = data.posts.filter((p) => !existing.has(p.id))
        return [...prev, ...deduped]
      })
      setPageInfo(data.pageInfo)
      currentCursorRef.current = cursor

      if (pageCache.size >= MAX_CACHED_PAGES) {
        const firstKey = pageCache.keys().next().value as string | undefined
        if (firstKey) pageCache.delete(firstKey)
      }
      pageCache.set(key, data)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      setError(e instanceof Error ? e.message : 'Erro ao carregar mais posts.')
    } finally {
      setLoadingMore(false)
    }
  }, [
    currentUser.id,
    endpointBase,
    loadingMore,
    pageInfo.hasMore,
    pageInfo.nextCursor,
    replaceUrlCursor,
    tenantId,
  ])

  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  const refreshCurrentPage = useCallback(async () => {
    if (refreshLockRef.current) return
    if (loadingMore) return

    refreshLockRef.current = true
    setError(null)

    try {
      abortRef.current?.abort()
      const ac = new AbortController()
      abortRef.current = ac

      const cursor = currentCursorRef.current
      const url = new URL(endpointBase, window.location.origin)
      url.searchParams.set('take', '20')
      if (cursor) url.searchParams.set('cursor', cursor)

      const res = await fetch(url.toString(), {
        method: 'GET',
        signal: ac.signal,
        credentials: 'include',
      })

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? 'Erro ao atualizar feed.')
      }

      const data = (await res.json()) as ApiPage

      setPosts((prev) => {
        const refreshedById = new Map(data.posts.map((p) => [p.id, p]))
        // Atualiza somente itens que fazem parte do trecho refinado; evita “pular” conteúdo.
        const updated = prev.map((p) => refreshedById.get(p.id) ?? p)

        // Se chegaram itens novos dentro do recorte, prepend para consistência.
        const prevIds = new Set(updated.map((p) => p.id))
        const newPosts = data.posts.filter((p) => !prevIds.has(p.id))
        return [...newPosts, ...updated]
      })
      setPageInfo(data.pageInfo)

      const key = cacheKey({
        tenantId,
        viewerId: currentUser.id,
        cursor: currentCursorRef.current,
      })
      pageCache.set(key, data)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      setError(e instanceof Error ? e.message : 'Erro ao atualizar feed.')
    } finally {
      refreshLockRef.current = false
    }
  }, [currentUser.id, endpointBase, loadingMore, tenantId])

  useFeedStream(() => {
    if (refreshDebounceRef.current) window.clearTimeout(refreshDebounceRef.current)
    refreshDebounceRef.current = window.setTimeout(() => {
      void refreshCurrentPage()
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
        void loadMore()
      },
      { root: null, rootMargin: '300px' },
    )

    obs.observe(el)
    return () => obs.disconnect()
  }, [loadMore])

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
        {posts.map((post, index) => (
          <MotionReveal key={post.id} index={index}>
            <FeedPostCard
              post={post}
              currentUser={currentUser}
              salvo={salvoSet.has(post.id)}
              showTenantBadge={post.tenantId !== tenantId}
            />
          </MotionReveal>
        ))}
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

