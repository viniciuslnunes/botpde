'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { PostSocialItem } from '@/lib/feed'
import { FeedPostCard } from '@/components/portal/feed-post-card'
import { MotionReveal } from '@/components/motion/motion-reveal'
import { ComunidadeFeedEmpty } from './comunidade-feed-empty'
import { useFeedStream } from '@/lib/use-feed-stream'
import { useComunidadeInfiniteFeed } from '@/lib/use-comunidade-infinite-feed'
import { useFeedWindow } from '@/lib/use-feed-window'
import {
  COMUNIDADE_POST_EXCLUIDO_EVENT,
  COMUNIDADE_POST_PUBLICADO_EVENT,
  FEED_SSE_DEBOUNCE_MS,
  isComunidadeFeedNearTop,
  type PostExcluidoEventDetail,
  type PostPublicadoEventDetail,
  type PostPublicadoPreview,
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

function previewParaPostSocial(preview: PostPublicadoPreview): PostSocialItem {
  return {
    id: preview.id,
    tenantId: preview.tenantId,
    titulo: null,
    conteudo: preview.conteudo,
    imagemUrl: preview.midiaUrls[0] ?? null,
    midiaUrls: preview.midiaUrls,
    tipo: 'MEMBRO',
    visibilidade: preview.visibilidade,
    fixado: false,
    criadoEm: new Date(preview.criadoEm),
    autorId: preview.autor.id,
    postOrigemId: null,
    comunicadoOrigemId: null,
    eventoId: null,
    tenant: { nome: preview.tenantNome },
    autor: {
      id: preview.autor.id,
      nome: preview.autor.nome,
      nickname: null,
      avatarUrl: preview.autor.avatarUrl,
      sedeNome: null,
      cargoNome: null,
      departamentoNome: null,
    },
    totalReacoes: 0,
    totalComentarios: 0,
    minhaReacao: null,
    postOrigem: null,
    comunicadoOrigem: null,
    evento: null,
    enquete: null,
    grupo: null,
  }
}

export function ComunidadeFeedInfinite({
  tenantId,
  currentUser,
  filtro,
  conversaId,
  initialPosts,
  initialPageInfo,
  initialCursor,
  salvoIds,
  seedFromSsr = true,
}: {
  tenantId: string
  currentUser: CurrentUser
  filtro: Filtro
  /** Obrigatório quando `filtro === 'canal'`. */
  conversaId?: string
  initialPosts: PostSocialItem[]
  initialPageInfo: PageInfo
  initialCursor: string | null
  salvoIds: string[]
  /** false no bootstrap do Suspense — evita seed vazio e usa cache/API. */
  seedFromSsr?: boolean
}) {
  const salvoSet = useMemo(() => new Set<string>(salvoIds), [salvoIds])

  const {
    posts,
    pageInfo,
    loadingMore,
    error,
    loadMore,
    refreshCurrentPage,
    prependPost,
    removePost,
  } = useComunidadeInfiniteFeed<PostSocialItem>({
    endpoint: '/api/comunidade/feed',
    tenantId,
    viewerId: currentUser.id,
    filtro,
    conversaId,
    initialPosts,
    initialPageInfo,
    initialCursor,
    seedFromSsr,
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
      void refreshCurrentPage(null)
    }, FEED_SSE_DEBOUNCE_MS)
  })

  // Publicação própria: prepend otimista + hydrate em background (sem bloquear UI).
  useEffect(() => {
    function onPostPublicado(ev: Event) {
      const detail = (ev as CustomEvent<PostPublicadoEventDetail>).detail
      if (detail?.preview) {
        prependPost(previewParaPostSocial(detail.preview))
      }
      const url = new URL(window.location.href)
      if (url.searchParams.has('cursor')) {
        url.searchParams.delete('cursor')
        window.history.replaceState({}, '', url.toString())
      }
      // Hydrate badges/enquete após o cache de tags aquecer — não compete com o prepend.
      window.setTimeout(() => {
        void refreshCurrentPage(null)
      }, 600)
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
  }, [prependPost, refreshCurrentPage, removePost])

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
