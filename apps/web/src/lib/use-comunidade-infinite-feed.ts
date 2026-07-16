'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export interface PageInfo {
  hasMore: boolean
  nextCursor: string | null
}

export type ComunidadeFeedPage<TPost> = {
  posts: TPost[]
  pageInfo: PageInfo
}

type FetchParams = {
  cursor: string | null
  signal: AbortSignal
}

const MAX_CACHED_PAGES = 12

function cacheKey(parts: string[]): string {
  return parts.join(':')
}

/**
 * Infinite scroll compartilhado (feed/rede) — dedupe, abort e cache de páginas.
 * Substitui Map manual duplicado; migração futura para TanStack Query quando
 * o pacote estiver instalável no ambiente.
 */
export function useComunidadeInfiniteFeed<TPost extends { id: string }>(options: {
  endpoint: string
  tenantId: string
  viewerId: string
  filtro?: string
  initialPosts: TPost[]
  initialPageInfo: PageInfo
  initialCursor: string | null
  take?: number
}) {
  const {
    endpoint,
    tenantId,
    viewerId,
    filtro,
    initialPosts,
    initialPageInfo,
    initialCursor,
    take = 20,
  } = options

  const pageCache = useRef(new Map<string, ComunidadeFeedPage<TPost>>())

  const [posts, setPosts] = useState<TPost[]>(initialPosts)
  const [pageInfo, setPageInfo] = useState<PageInfo>(initialPageInfo)
  const [currentCursor, setCurrentCursor] = useState<string | null>(initialCursor)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const loadedCursorsRef = useRef<Set<string | null>>(new Set([initialCursor]))

  const buildKey = useCallback(
    (cursor: string | null) =>
      cacheKey([tenantId, viewerId, filtro ?? '', cursor ?? '']),
    [tenantId, viewerId, filtro],
  )

  const fetchPage = useCallback(
    async ({ cursor, signal }: FetchParams): Promise<ComunidadeFeedPage<TPost>> => {
      const url = new URL(endpoint, window.location.origin)
      url.searchParams.set('take', String(take))
      if (cursor) url.searchParams.set('cursor', cursor)
      if (filtro) url.searchParams.set('filtro', filtro)

      const res = await fetch(url.toString(), {
        method: 'GET',
        signal,
        credentials: 'include',
      })

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? 'Erro ao carregar posts.')
      }

      return (await res.json()) as ComunidadeFeedPage<TPost>
    },
    [endpoint, filtro, take],
  )

  const mergePosts = useCallback((prev: TPost[], incoming: TPost[]) => {
    const existing = new Set(prev.map((p) => p.id))
    const deduped = incoming.filter((p) => !existing.has(p.id))
    return [...prev, ...deduped]
  }, [])

  const loadMore = useCallback(async () => {
    if (!pageInfo.hasMore || !pageInfo.nextCursor) return
    if (loadingMore) return

    const cursor = pageInfo.nextCursor
    if (loadedCursorsRef.current.has(cursor)) return

    const key = buildKey(cursor)
    const cached = pageCache.current.get(key)
    if (cached) {
      loadedCursorsRef.current.add(cursor)
      setPosts((prev) => mergePosts(prev, cached.posts))
      setPageInfo(cached.pageInfo)
      return
    }

    loadedCursorsRef.current.add(cursor)
    setLoadingMore(true)
    setError(null)

    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    try {
      const data = await fetchPage({ cursor, signal: ac.signal })

      setPosts((prev) => mergePosts(prev, data.posts))
      setPageInfo(data.pageInfo)
      setCurrentCursor(cursor)

      if (pageCache.current.size >= MAX_CACHED_PAGES) {
        const firstKey = pageCache.current.keys().next().value as string | undefined
        if (firstKey) pageCache.current.delete(firstKey)
      }
      pageCache.current.set(key, data)

      return cursor
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      setError(e instanceof Error ? e.message : 'Erro ao carregar mais posts.')
    } finally {
      setLoadingMore(false)
    }
  }, [buildKey, fetchPage, loadingMore, mergePosts, pageInfo.hasMore, pageInfo.nextCursor])

  const refreshCurrentPage = useCallback(
    async (cursorOverride?: string | null) => {
      const cursor = cursorOverride !== undefined ? cursorOverride : currentCursor
      setError(null)
      abortRef.current?.abort()
      const ac = new AbortController()
      abortRef.current = ac

      try {
        const data = await fetchPage({ cursor, signal: ac.signal })
        const refreshedIds = new Set(data.posts.map((p) => p.id))

        setPosts((prev) => {
          const prevIds = new Set(prev.map((p) => p.id))
          const mergedNew = data.posts.filter((p) => !prevIds.has(p.id))
          const merged = [...mergedNew, ...prev]
          const unique: TPost[] = []
          const seen = new Set<string>()
          for (const p of merged) {
            if (seen.has(p.id)) continue
            seen.add(p.id)
            unique.push(p)
          }
          const top = unique.filter((p) => refreshedIds.has(p.id))
          const rest = unique.filter((p) => !refreshedIds.has(p.id))
          return [...top, ...rest]
        })

        setPageInfo(data.pageInfo)
        pageCache.current.set(buildKey(cursor), data)
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
        setError(e instanceof Error ? e.message : 'Erro ao atualizar feed.')
      }
    },
    [buildKey, currentCursor, fetchPage],
  )

  useEffect(() => () => abortRef.current?.abort(), [])

  return {
    posts,
    pageInfo,
    currentCursor,
    loadingMore,
    error,
    loadMore,
    refreshCurrentPage,
    setError,
  }
}
