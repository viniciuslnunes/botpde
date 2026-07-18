import { getPostsDaRede, getPostsParaFeed, getPostsDosMeusGrupos, getPostIdsSalvos } from '@/lib/feed'
import { ComunidadeFeedInfinite } from './comunidade-feed-infinite'

interface CurrentUser {
  id: string
  nome: string | null
  avatarUrl: string | null
}

interface ComunidadePostsSectionProps {
  tenantId: string
  currentUser: CurrentUser
  cursor?: string
  /** 'descobrir' | 'seguindo' | 'grupos' */
  filtro?: 'descobrir' | 'seguindo' | 'grupos'
}

export async function ComunidadePostsSection({
  tenantId,
  currentUser,
  cursor,
  filtro = 'descobrir',
}: ComunidadePostsSectionProps) {
  const salvoIds = currentUser.id
    ? await getPostIdsSalvos(currentUser.id, tenantId)
    : new Set<string>()

  if (filtro === 'seguindo') {
    const feed = await getPostsDaRede(tenantId, currentUser.id, { cursor, take: 20 })
    return (
      <ComunidadeFeedInfinite
        tenantId={tenantId}
        currentUser={currentUser}
        filtro={filtro}
        initialPosts={feed.posts}
        initialPageInfo={feed.pageInfo}
        initialCursor={cursor ?? null}
        salvoIds={[...salvoIds]}
      />
    )
  }

  if (filtro === 'grupos') {
    const feed = await getPostsDosMeusGrupos(tenantId, currentUser.id, { cursor, take: 20 })
    return (
      <ComunidadeFeedInfinite
        tenantId={tenantId}
        currentUser={currentUser}
        filtro={filtro}
        initialPosts={feed.posts}
        initialPageInfo={feed.pageInfo}
        initialCursor={cursor ?? null}
        salvoIds={[...salvoIds]}
      />
    )
  }

  const feed = await getPostsParaFeed(tenantId, currentUser.id || undefined, { cursor, take: 20 })

  return (
    <ComunidadeFeedInfinite
      tenantId={tenantId}
      currentUser={currentUser}
      filtro={filtro}
      initialPosts={feed.posts}
      initialPageInfo={feed.pageInfo}
      initialCursor={cursor ?? null}
      salvoIds={[...salvoIds]}
    />
  )
}
