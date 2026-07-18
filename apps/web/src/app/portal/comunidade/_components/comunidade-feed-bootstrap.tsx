'use client'

import { ComunidadeFeedInfinite } from './comunidade-feed-infinite'

interface CurrentUser {
  id: string
  nome: string | null
  avatarUrl: string | null
}

/**
 * Fallback do Suspense dos posts: monta o infinite feed na hora.
 * Se o QueryClient (layout) ainda tem cache da visita anterior, a lista
 * aparece sem esperar o RSC `getPostsParaFeed`. Cache frio → fetch da API.
 */
export function ComunidadeFeedBootstrap({
  tenantId,
  currentUser,
  filtro = 'descobrir',
  cursor = null,
}: {
  tenantId: string
  currentUser: CurrentUser
  filtro?: 'descobrir' | 'seguindo'
  cursor?: string | null
}) {
  return (
    <ComunidadeFeedInfinite
      tenantId={tenantId}
      currentUser={currentUser}
      filtro={filtro}
      initialPosts={[]}
      initialPageInfo={{ hasMore: true, nextCursor: null }}
      initialCursor={cursor}
      salvoIds={[]}
      seedFromSsr={false}
    />
  )
}
