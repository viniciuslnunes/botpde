'use client'

import { ComunidadeFeedInfinite } from './comunidade-feed-infinite'
import type { EscopoComunidade } from '@/lib/comunidade-escopo'

interface CurrentUser {
  id: string
  nome: string | null
  avatarUrl: string | null
}

/**
 * Fallback do Suspense dos posts: monta o infinite feed na hora.
 * Se o QueryClient (layout) ainda tem cache da visita anterior, a lista
 * aparece sem esperar o RSC. Cache frio → fetch da API.
 */
export function ComunidadeFeedBootstrap({
  tenantId,
  currentUser,
  filtro = 'descobrir',
  cursor = null,
  escopo,
  afiliacaoId,
  contextoComunidadeNome = null,
}: {
  tenantId: string
  currentUser: CurrentUser
  filtro?: 'descobrir' | 'seguindo' | 'grupos' | 'canal'
  cursor?: string | null
  escopo?: EscopoComunidade
  afiliacaoId?: string
  contextoComunidadeNome?: string | null
}) {
  return (
    <ComunidadeFeedInfinite
      tenantId={tenantId}
      currentUser={currentUser}
      filtro={filtro}
      escopo={escopo}
      afiliacaoId={afiliacaoId}
      initialPosts={[]}
      initialPageInfo={{ hasMore: true, nextCursor: null }}
      initialCursor={cursor}
      salvoIds={[]}
      seedFromSsr={false}
      contextoComunidadeNome={contextoComunidadeNome}
    />
  )
}
