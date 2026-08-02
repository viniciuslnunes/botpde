import {
  getPostsDaRede,
  getPostsParaFeed,
  getPostsDosMeusGrupos,
  getPostIdsSalvos,
  getPostsFeedNacional,
  getPostsFeedNacionalSeguindo,
  getPostsFeedNacionalGrupos,
} from '@/lib/feed'
import { getPostsDoCanal } from '@/lib/canais'
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
  /** 'descobrir' | 'seguindo' | 'grupos' | 'canal' */
  filtro?: 'descobrir' | 'seguindo' | 'grupos' | 'canal'
  /** Obrigatório quando `filtro === 'canal'` — id da Conversa (canal). */
  conversaId?: string
  /** Feed da Comunidade Nacional do clube — `tenantId` é o sintético. */
  escopo?: 'nacional' | 'torcida'
  /** Obrigatório quando `escopo === 'nacional'`. */
  afiliacaoId?: string | null
}

export async function ComunidadePostsSection({
  tenantId,
  currentUser,
  cursor,
  filtro = 'descobrir',
  conversaId,
  escopo = 'torcida',
  afiliacaoId,
}: ComunidadePostsSectionProps) {
  if (escopo === 'nacional' && afiliacaoId) {
    const feedOpts = { cursor, take: 20 }
    const feed =
      filtro === 'seguindo'
        ? await getPostsFeedNacionalSeguindo(afiliacaoId, currentUser.id, feedOpts)
        : filtro === 'grupos'
          ? await getPostsFeedNacionalGrupos(afiliacaoId, currentUser.id, feedOpts)
          : await getPostsFeedNacional(afiliacaoId, currentUser.id || undefined, feedOpts)
    const salvoIds = currentUser.id
      ? await getPostIdsSalvos(currentUser.id, tenantId)
      : new Set<string>()

    return (
      <ComunidadeFeedInfinite
        tenantId={tenantId}
        currentUser={currentUser}
        filtro={filtro}
        escopo="nacional"
        afiliacaoId={afiliacaoId}
        initialPosts={feed.posts}
        initialPageInfo={feed.pageInfo}
        initialCursor={cursor ?? null}
        salvoIds={[...salvoIds]}
      />
    )
  }

  const salvoIds = currentUser.id
    ? await getPostIdsSalvos(currentUser.id, tenantId)
    : new Set<string>()

  if (filtro === 'canal') {
    if (!conversaId) throw new Error('conversaId obrigatório para filtro="canal".')
    const feed = await getPostsDoCanal(conversaId, tenantId, currentUser.id, { cursor, take: 20 })
    return (
      <ComunidadeFeedInfinite
        tenantId={tenantId}
        currentUser={currentUser}
        filtro={filtro}
        conversaId={conversaId}
        escopo="torcida"
        initialPosts={feed.posts}
        initialPageInfo={feed.pageInfo}
        initialCursor={cursor ?? null}
        salvoIds={[...salvoIds]}
      />
    )
  }

  if (filtro === 'seguindo') {
    const feed = await getPostsDaRede(tenantId, currentUser.id, { cursor, take: 20 })
    return (
      <ComunidadeFeedInfinite
        tenantId={tenantId}
        currentUser={currentUser}
        filtro={filtro}
        escopo="torcida"
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
        escopo="torcida"
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
      escopo="torcida"
      initialPosts={feed.posts}
      initialPageInfo={feed.pageInfo}
      initialCursor={cursor ?? null}
      salvoIds={[...salvoIds]}
    />
  )
}
