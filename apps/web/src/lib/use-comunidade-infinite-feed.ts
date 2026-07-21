'use client'

import { useCallback, useMemo } from 'react'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'

export interface PageInfo {
  hasMore: boolean
  nextCursor: string | null
}

export type ComunidadeFeedPage<TPost> = {
  posts: TPost[]
  pageInfo: PageInfo
}

/** Mantém o feed ao navegar Buscar/Classificação ↔ Feed (layout preserva o provider). */
export const COMUNIDADE_FEED_GC_MS = 20 * 60 * 1000

export function comunidadeFeedQueryKey(
  endpoint: string,
  tenantId: string,
  viewerId: string,
  filtro?: string,
  conversaId?: string,
) {
  return ['comunidade-feed', endpoint, tenantId, viewerId, filtro ?? '', conversaId ?? ''] as const
}

async function fetchFeedPage<TPost>(params: {
  endpoint: string
  cursor: string | null
  take: number
  filtro?: string
  conversaId?: string
  signal: AbortSignal
}): Promise<ComunidadeFeedPage<TPost>> {
  const url = new URL(params.endpoint, window.location.origin)
  url.searchParams.set('take', String(params.take))
  if (params.cursor) url.searchParams.set('cursor', params.cursor)
  if (params.filtro) url.searchParams.set('filtro', params.filtro)
  if (params.conversaId) url.searchParams.set('conversaId', params.conversaId)

  const res = await fetch(url.toString(), {
    method: 'GET',
    signal: params.signal,
    credentials: 'include',
  })

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? 'Erro ao carregar posts.')
  }

  return (await res.json()) as ComunidadeFeedPage<TPost>
}

/**
 * Infinite scroll do feed/rede via TanStack Query (dedupe, cache, retry).
 * SSR pode seedar a 1ª página; cache quente no layout não é sobrescrito.
 */
export function useComunidadeInfiniteFeed<TPost extends { id: string }>(options: {
  endpoint: string
  tenantId: string
  viewerId: string
  filtro?: string
  /** Escopa a página a um canal específico (`filtro: 'canal'`). */
  conversaId?: string
  initialPosts: TPost[]
  initialPageInfo: PageInfo
  initialCursor: string | null
  take?: number
  /** Quando false (bootstrap Suspense), não grava página vazia como initialData. */
  seedFromSsr?: boolean
}) {
  const {
    endpoint,
    tenantId,
    viewerId,
    filtro,
    conversaId,
    initialPosts,
    initialPageInfo,
    initialCursor,
    take = 20,
    seedFromSsr = true,
  } = options

  const queryClient = useQueryClient()
  const queryKey = useMemo(
    () => comunidadeFeedQueryKey(endpoint, tenantId, viewerId, filtro, conversaId),
    [endpoint, tenantId, viewerId, filtro, conversaId],
  )

  const cached = queryClient.getQueryData<{
    pages: ComunidadeFeedPage<TPost>[]
    pageParams: Array<string | null>
  }>(queryKey)

  const shouldSeed =
    seedFromSsr && initialPosts.length > 0 && (!cached || cached.pages.length === 0)

  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam, signal }) =>
      fetchFeedPage<TPost>({
        endpoint,
        cursor: pageParam,
        take,
        filtro,
        conversaId,
        signal,
      }),
    initialPageParam: (shouldSeed ? initialCursor : null) as string | null,
    getNextPageParam: (last) =>
      last.pageInfo.hasMore ? last.pageInfo.nextCursor : undefined,
    // Só seeda se não há cache — senão o QueryClient (layout) já tem a lista.
    ...(shouldSeed
      ? {
          initialData: {
            pages: [{ posts: initialPosts, pageInfo: initialPageInfo }],
            pageParams: [initialCursor],
          },
        }
      : {}),
    staleTime: 30_000,
    gcTime: COMUNIDADE_FEED_GC_MS,
  })

  const posts = useMemo(() => {
    const seen = new Set<string>()
    const flat: TPost[] = []
    for (const page of query.data?.pages ?? []) {
      for (const post of page.posts) {
        if (seen.has(post.id)) continue
        seen.add(post.id)
        flat.push(post)
      }
    }
    return flat
  }, [query.data?.pages])

  const lastPage = query.data?.pages[query.data.pages.length - 1]
  const pageInfo: PageInfo = lastPage?.pageInfo ?? initialPageInfo
  const currentCursor =
    (query.data?.pageParams[query.data.pageParams.length - 1] as string | null | undefined) ??
    initialCursor

  const loadMore = useCallback(async (): Promise<string | undefined> => {
    if (!pageInfo.hasMore || !pageInfo.nextCursor) return
    if (query.isFetchingNextPage) return

    const cursor = pageInfo.nextCursor
    await query.fetchNextPage()
    return cursor
  }, [pageInfo.hasMore, pageInfo.nextCursor, query])

  const refreshCurrentPage = useCallback(
    async (cursorOverride?: string | null) => {
      const cursor = cursorOverride !== undefined ? cursorOverride : initialCursor
      try {
        const fresh = await fetchFeedPage<TPost>({
          endpoint,
          cursor,
          take,
          filtro,
          conversaId,
          signal: new AbortController().signal,
        })

        queryClient.setQueryData(
          queryKey,
          (prev: { pages: ComunidadeFeedPage<TPost>[]; pageParams: Array<string | null> } | undefined) => {
            if (cursor == null) {
              const freshIds = new Set(fresh.posts.map((p) => p.id))
              const kept =
                prev?.pages[0]?.posts.filter((p) => !freshIds.has(p.id)) ?? []
              return {
                pages: [
                  {
                    posts: [...kept, ...fresh.posts],
                    pageInfo: fresh.pageInfo,
                  },
                ],
                pageParams: [null],
              }
            }

            if (!prev || prev.pages.length === 0) {
              return {
                pages: [fresh],
                pageParams: [cursor],
              }
            }

            const refreshedIds = new Set(fresh.posts.map((p) => p.id))
            const restPosts = prev.pages
              .flatMap((p) => p.posts)
              .filter((p) => !refreshedIds.has(p.id))

            const mergedPage: ComunidadeFeedPage<TPost> = {
              posts: [...fresh.posts, ...restPosts],
              pageInfo: fresh.pageInfo,
            }

            return {
              pages: [mergedPage, ...prev.pages.slice(1)],
              pageParams: [cursor, ...prev.pageParams.slice(1)],
            }
          },
        )
      } catch {
        // SSE refresh silencioso
      }
    },
    [endpoint, filtro, conversaId, initialCursor, queryClient, queryKey, take],
  )

  const prependPost = useCallback(
    (post: TPost) => {
      queryClient.setQueryData(
        queryKey,
        (prev: { pages: ComunidadeFeedPage<TPost>[]; pageParams: Array<string | null> } | undefined) => {
          if (!prev || prev.pages.length === 0) {
            return {
              pages: [{ posts: [post], pageInfo: { hasMore: false, nextCursor: null } }],
              pageParams: [null],
            }
          }
          const first = prev.pages[0]
          if (first.posts.some((p) => p.id === post.id)) return prev
          return {
            ...prev,
            pages: [{ ...first, posts: [post, ...first.posts] }, ...prev.pages.slice(1)],
          }
        },
      )
    },
    [queryClient, queryKey],
  )

  return {
    posts,
    pageInfo,
    currentCursor,
    loadingMore: query.isFetchingNextPage,
    error: query.error instanceof Error ? query.error.message : null,
    loadMore,
    refreshCurrentPage,
    prependPost,
  }
}
