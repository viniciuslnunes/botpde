'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import type { EscopoComunidade } from '@/lib/comunidade-escopo'

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
  escopo?: string,
  afiliacaoId?: string,
  feedInterno?: boolean,
) {
  return [
    'comunidade-feed',
    endpoint,
    tenantId,
    viewerId,
    filtro ?? '',
    conversaId ?? '',
    escopo ?? '',
    afiliacaoId ?? '',
    // Separar mural puro (soft-switch) do mural próprio (Minha torcida) e
    // invalidar cache antigo que misturava TENANT da Sede em PDE Caso A.
    feedInterno ? 'fi1' : 'fi0',
  ] as const
}

async function fetchFeedPage<TPost>(params: {
  endpoint: string
  cursor: string | null
  take: number
  filtro?: string
  conversaId?: string
  escopo?: EscopoComunidade
  afiliacaoId?: string
  feedInterno?: boolean
  signal: AbortSignal
}): Promise<ComunidadeFeedPage<TPost>> {
  const url = new URL(params.endpoint, window.location.origin)
  url.searchParams.set('take', String(params.take))
  if (params.cursor) url.searchParams.set('cursor', params.cursor)
  if (params.filtro) url.searchParams.set('filtro', params.filtro)
  if (params.conversaId) url.searchParams.set('conversaId', params.conversaId)
  if (params.escopo) url.searchParams.set('escopo', params.escopo)
  if (params.afiliacaoId) url.searchParams.set('afiliacaoId', params.afiliacaoId)
  if (params.feedInterno) url.searchParams.set('feedInterno', '1')

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

/** Prefetch da 1ª página — soft-switch / hover de aba temática. */
export async function prefetchComunidadeFeedPage(params: {
  queryClient: import('@tanstack/react-query').QueryClient
  endpoint: string
  tenantId: string
  viewerId: string
  filtro?: string
  conversaId?: string
  escopo?: EscopoComunidade
  afiliacaoId?: string
  feedInterno?: boolean
  take?: number
}): Promise<void> {
  const take = params.take ?? 20
  const queryKey = comunidadeFeedQueryKey(
    params.endpoint,
    params.tenantId,
    params.viewerId,
    params.filtro,
    params.conversaId,
    params.escopo,
    params.afiliacaoId,
    params.feedInterno,
  )
  const cached = params.queryClient.getQueryData(queryKey)
  if (cached) return

  await params.queryClient.prefetchInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam, signal }) =>
      fetchFeedPage({
        endpoint: params.endpoint,
        cursor: (pageParam as string | null) ?? null,
        take,
        filtro: params.filtro,
        conversaId: params.conversaId,
        escopo: params.escopo,
        afiliacaoId: params.afiliacaoId,
        feedInterno: params.feedInterno,
        signal,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last: ComunidadeFeedPage<unknown>) => {
      if (!last.pageInfo.hasMore || !last.pageInfo.nextCursor) return undefined
      return last.pageInfo.nextCursor
    },
    staleTime: 30_000,
    gcTime: COMUNIDADE_FEED_GC_MS,
  })
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
  /** Feed da Comunidade Nacional — passa `afiliacaoId` junto. */
  escopo?: EscopoComunidade
  afiliacaoId?: string
  /** Minha torcida/unidade: mistura "Só torcida" no mural oficial. */
  feedInterno?: boolean
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
    escopo,
    afiliacaoId,
    feedInterno = false,
    initialPosts,
    initialPageInfo,
    initialCursor,
    take = 20,
    seedFromSsr = true,
  } = options

  const queryClient = useQueryClient()
  const [isRefreshing, setIsRefreshing] = useState(false)
  const queryKey = useMemo(
    () =>
      comunidadeFeedQueryKey(
        endpoint,
        tenantId,
        viewerId,
        filtro,
        conversaId,
        escopo,
        afiliacaoId,
        feedInterno,
      ),
    [endpoint, tenantId, viewerId, filtro, conversaId, escopo, afiliacaoId, feedInterno],
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
        escopo,
        afiliacaoId,
        feedInterno,
        signal,
      }),
    initialPageParam: (shouldSeed ? initialCursor : null) as string | null,
    getNextPageParam: (last, _pages, lastPageParam) => {
      if (!last.pageInfo.hasMore || !last.pageInfo.nextCursor) return undefined
      // Cursor idêntico ao que acabamos de pedir = API não avançou (ex.: OR
      // do filtro sobrescrevendo o do cursor). Sem isto o observer dispara
      // fetch eterno e a UI fica no skeleton "Carregando mais…".
      if (last.pageInfo.nextCursor === lastPageParam) return undefined
      return last.pageInfo.nextCursor
    },
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

  const { fetchNextPage, isFetchingNextPage, isPending, hasNextPage, error: queryError, data: queryData } =
    query
  const loadMoreInFlight = useRef(false)

  const posts = useMemo(() => {
    const seen = new Set<string>()
    const flat: TPost[] = []
    for (const page of queryData?.pages ?? []) {
      for (const post of page.posts) {
        if (seen.has(post.id)) continue
        seen.add(post.id)
        flat.push(post)
      }
    }
    return flat
  }, [queryData?.pages])

  const lastPage = queryData?.pages[queryData.pages.length - 1]
  // `hasNextPage` respeita getNextPageParam (incl. guarda de cursor preso).
  // Não usar só `pageInfo.hasMore` da API — senão o observer continua
  // pedindo página depois que o cursor parou de avançar.
  const pageInfo: PageInfo = {
    hasMore: Boolean(hasNextPage),
    nextCursor: lastPage?.pageInfo.nextCursor ?? null,
  }
  const currentCursor =
    (queryData?.pageParams[queryData.pageParams.length - 1] as string | null | undefined) ??
    initialCursor

  const loadMore = useCallback(async (): Promise<string | undefined> => {
    if (!hasNextPage || !pageInfo.nextCursor) return
    if (isFetchingNextPage || loadMoreInFlight.current) return

    const cursor = pageInfo.nextCursor
    loadMoreInFlight.current = true
    try {
      // cancelRefetch:false — o observer não deve abortar a página em voo
      // (senão isFetchingNextPage oscila e o skeleton trava).
      await fetchNextPage({ cancelRefetch: false })
      return cursor
    } finally {
      loadMoreInFlight.current = false
    }
  }, [hasNextPage, pageInfo.nextCursor, isFetchingNextPage, fetchNextPage])

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
          escopo,
          afiliacaoId,
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
    [endpoint, filtro, conversaId, escopo, afiliacaoId, initialCursor, queryClient, queryKey, take],
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

  const replacePost = useCallback(
    (oldId: string, post: TPost) => {
      queryClient.setQueryData(
        queryKey,
        (prev: { pages: ComunidadeFeedPage<TPost>[]; pageParams: Array<string | null> } | undefined) => {
          if (!prev || prev.pages.length === 0) {
            return {
              pages: [{ posts: [post], pageInfo: { hasMore: false, nextCursor: null } }],
              pageParams: [null],
            }
          }
          let changed = false
          const pages = prev.pages.map((page, index) => {
            if (index !== 0) return page
            const idx = page.posts.findIndex((p) => p.id === oldId)
            if (idx === -1) {
              if (page.posts.some((p) => p.id === post.id)) return page
              changed = true
              return { ...page, posts: [post, ...page.posts] }
            }
            changed = true
            const nextPosts = [...page.posts]
            nextPosts[idx] = post
            return { ...page, posts: nextPosts }
          })
          return changed ? { ...prev, pages } : prev
        },
      )
    },
    [queryClient, queryKey],
  )

  /** Remove de todos os caches `comunidade-feed` (descobrir/seguindo/rede/canal…). */
  const removePost = useCallback(
    (postId: string) => {
      queryClient.setQueriesData<{
        pages: ComunidadeFeedPage<TPost>[]
        pageParams: Array<string | null>
      }>({ queryKey: ['comunidade-feed'] }, (prev) => {
        if (!prev) return prev
        let changed = false
        const pages = prev.pages.map((page) => {
          const nextPosts = page.posts.filter((p) => p.id !== postId)
          if (nextPosts.length === page.posts.length) return page
          changed = true
          return { ...page, posts: nextPosts }
        })
        return changed ? { ...prev, pages } : prev
      })
    },
    [queryClient],
  )

  return {
    posts,
    pageInfo,
    currentCursor,
    loadingMore: isFetchingNextPage,
    /**
     * Primeira página ainda em voo (bootstrap com cache frio, sem seed do SSR).
     * Sem isso a lista vazia cai no empty state enquanto o fetch acontece.
     */
    loadingInicial: isPending,
    isRefreshing,
    error: queryError instanceof Error ? queryError.message : null,
    loadMore,
    refreshCurrentPage,
    prependPost,
    replacePost,
    removePost,
  }
}
