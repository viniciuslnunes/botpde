'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PostSocialItem } from '@/lib/feed'
import { FeedPostCard } from '@/components/portal/feed-post-card'
import { MotionReveal } from '@/components/motion/motion-reveal'
import { ComunidadeFeedEmpty } from './comunidade-feed-empty'
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

type Filtro = 'descobrir' | 'seguindo'

type ApiPage = {
  posts: PostSocialItem[]
  pageInfo: PageInfo
}

const pageCache = new Map<string, ApiPage>()
const MAX_CACHED_PAGES = 12

function cacheKey(params: { tenantId: string; viewerId: string; filtro: Filtro; cursor: string | null }) {
  return `${params.tenantId}:${params.viewerId}:${params.filtro}:${params.cursor ?? ''}`
}

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

  const [posts, setPosts] = useState<PostSocialItem[]>(initialPosts)
  const [pageInfo, setPageInfo] = useState<PageInfo>(initialPageInfo)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const loadedCursorsRef = useRef<Set<string | null>>(new Set([initialCursor]))

  const endpointBase = '/api/comunidade/feed'

  const refreshLockRef = useRef(false)
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

  const loadMore = useCallback(async () => {
    if (!pageInfo.hasMore || !pageInfo.nextCursor) return
    if (loadingMore) return
    if (loadedCursorsRef.current.has(pageInfo.nextCursor)) return

    const cursor = pageInfo.nextCursor
    const key = cacheKey({ tenantId, viewerId: currentUser.id, filtro, cursor })
    if (pageCache.has(key)) {
      const cached = pageCache.get(key)
      if (cached) {
        loadedCursorsRef.current.add(cursor)
        setPosts((prev) => [...prev, ...cached.posts])
        setPageInfo(cached.pageInfo)
      }
      return
    }

    loadedCursorsRef.current.add(cursor)
    setLoadingMore(true)
    setError(null)

    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    try {
      const url = new URL(endpointBase, window.location.origin)
      url.searchParams.set('take', '20')
      url.searchParams.set('cursor', cursor)
      url.searchParams.set('filtro', filtro)

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

      // Cache simples: armazena apenas páginas já consultadas para evitar duplicar requests.
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
    endpointBase,
    filtro,
    currentUser.id,
    loadingMore,
    pageInfo.hasMore,
    pageInfo.nextCursor,
    tenantId,
    replaceUrlCursor,
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

      const url = new URL(endpointBase, window.location.origin)
      url.searchParams.set('take', '20')
      url.searchParams.set('filtro', filtro)
      if (initialCursor) url.searchParams.set('cursor', initialCursor)
      // cursor null means "primeira página" para o recorte atual.

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

      const refreshedIds = new Set(data.posts.map((p) => p.id))
      setPosts((prev) => {
        // Mantém o restante já carregado, mas injeta/sync o trecho atual.
        // Como keyset não é “offset”, deduplicamos por id.
        const prevIds = new Set(prev.map((p) => p.id))
        const mergedNew = data.posts.filter((p) => !prevIds.has(p.id))
        const merged = [...mergedNew, ...prev]

        // Se a página atual mudou e removeu itens (ex.: moderação), limpamos removidos.
        // Mantém itens que já estavam na lista e não pertencem estritamente ao recorte atual.
        // Para segurança de UX, só removemos duplicatas por id.
        const unique: PostSocialItem[] = []
        const seen = new Set<string>()
        for (const p of merged) {
          if (seen.has(p.id)) continue
          seen.add(p.id)
          unique.push(p)
        }

        // Garantir que a página refinada do recorte esteja no topo.
        const top = unique.filter((p) => refreshedIds.has(p.id))
        const rest = unique.filter((p) => !refreshedIds.has(p.id))
        return [...top, ...rest]
      })

      setPageInfo(data.pageInfo)

      const key = cacheKey({
        tenantId,
        viewerId: currentUser.id,
        filtro,
        cursor: initialCursor,
      })
      pageCache.set(key, data)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      setError(e instanceof Error ? e.message : 'Erro ao atualizar feed.')
    } finally {
      refreshLockRef.current = false
    }
  }, [currentUser.id, endpointBase, filtro, initialCursor, loadingMore, tenantId])

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

  return (
    <>
      <section className="space-y-4">
        {posts.length === 0 ? (
          <ComunidadeFeedEmpty filtro={filtro} />
        ) : (
          posts.map((post, index) => (
            <MotionReveal key={post.id} index={index}>
              <FeedPostCard
                post={post}
                showTenantBadge={post.tenantId !== tenantId}
                currentUser={currentUser}
                salvo={salvoSet.has(post.id)}
              />
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

