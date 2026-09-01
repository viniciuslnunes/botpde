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
import type { EscopoComunidade } from '@/lib/comunidade-escopo'

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
  /**
   * Mural de canal oficial: mistura posts do canal + "Só torcida" do feed
   * aberto. Temáticos ignoram. O tenant do balde interno vem de
   * `feedInternoTenantId` (Caso B ≠ tenant da aba).
   */
  incluirFeedInterno?: boolean
  /** Tenant dos posts "Só torcida" quando `incluirFeedInterno`. */
  feedInternoTenantId?: string | null
  /** Feed da Comunidade Nacional do clube — `tenantId` é o sintético. */
  escopo?: EscopoComunidade
  /** Obrigatório quando `escopo === 'nacional'`. */
  afiliacaoId?: string | null
  /** Sócio compartilha; torcedor só curte/comenta/salva. */
  podeCompartilhar?: boolean
  contextoComunidadeNome?: string | null
}

export async function ComunidadePostsSection({
  tenantId,
  currentUser,
  cursor,
  filtro = 'descobrir',
  conversaId,
  incluirFeedInterno = false,
  feedInternoTenantId = null,
  escopo = 'torcida',
  afiliacaoId,
  podeCompartilhar = true,
  contextoComunidadeNome = null,
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
        podeCompartilhar={podeCompartilhar}
        contextoComunidadeNome={contextoComunidadeNome}
      />
    )
  }

  const salvoIds = currentUser.id
    ? await getPostIdsSalvos(currentUser.id, tenantId)
    : new Set<string>()

  if (filtro === 'canal') {
    if (!conversaId) throw new Error('conversaId obrigatório para filtro="canal".')
    const feed = await getPostsDoCanal(conversaId, tenantId, currentUser.id, {
      cursor,
      take: 20,
      incluirFeedInterno,
      viewerTenantId: feedInternoTenantId ?? tenantId,
    })
    return (
      <ComunidadeFeedInfinite
        tenantId={tenantId}
        currentUser={currentUser}
        filtro={filtro}
        conversaId={conversaId}
        escopo="torcida"
        incluirFeedInterno={incluirFeedInterno}
        initialPosts={feed.posts}
        initialPageInfo={feed.pageInfo}
        initialCursor={cursor ?? null}
        salvoIds={[...salvoIds]}
        podeCompartilhar={podeCompartilhar}
        contextoComunidadeNome={contextoComunidadeNome}
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
        podeCompartilhar={podeCompartilhar}
        contextoComunidadeNome={contextoComunidadeNome}
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
        podeCompartilhar={podeCompartilhar}
        contextoComunidadeNome={contextoComunidadeNome}
      />
    )
  }

  const feed = await getPostsParaFeed(tenantId, currentUser.id || undefined, {
    cursor,
    take: 20,
    escopoForum: escopo === 'unidade' ? 'unidade' : 'torcida',
  })

  return (
    <ComunidadeFeedInfinite
      tenantId={tenantId}
      currentUser={currentUser}
      filtro={filtro}
      escopo={escopo === 'unidade' ? 'unidade' : 'torcida'}
      initialPosts={feed.posts}
      initialPageInfo={feed.pageInfo}
      initialCursor={cursor ?? null}
      salvoIds={[...salvoIds]}
      podeCompartilhar={podeCompartilhar}
      contextoComunidadeNome={contextoComunidadeNome}
    />
  )
}
