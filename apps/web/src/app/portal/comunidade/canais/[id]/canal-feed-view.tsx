import { Suspense, type ReactNode } from 'react'
import {
  resolverChromeCanalMural,
  type CanalItem,
} from '@/lib/canais'
import { FeedComposerSkeleton, FeedPostSkeletonList } from '@/components/portal/feed-skeletons'
import { ComunidadePostsSection } from '../../_components/comunidade-posts-section'
import { CanalFeedComposition } from './canal-feed-composition'
import { CanalComposerSection } from './canal-composer-section'

interface CurrentUser {
  id: string
  nome: string | null
  avatarUrl: string | null
}

function CanalFeedFallback() {
  return (
    <div role="status" aria-live="polite" aria-busy>
      <span className="sr-only">Carregando publicações do canal…</span>
      <FeedPostSkeletonList count={3} />
    </div>
  )
}

function ComposerFallback() {
  return <FeedComposerSkeleton />
}

/**
 * Visão unificada de canal (oficial ou temático): cabeçalho fino + composer
 * leve + mesma lista/paginação infinita do feed principal. Usada pelo feed
 * principal (escopos oficiais). Detalhe temático `/canais/[id]` usa soft-switch.
 *
 * Listas de gestão ficam fora do critical path — lazy no modal.
 */
export async function CanalFeedView({
  canal,
  currentUser,
  podePublicar,
  cursor,
  viewerTenantId,
  permissoes,
  podeCompartilhar = true,
  leituraOperador = false,
  buscaChrome = null,
}: {
  canal: CanalItem
  currentUser: CurrentUser
  podePublicar: boolean
  cursor?: string
  viewerTenantId: string
  permissoes: string[]
  podeCompartilhar?: boolean
  leituraOperador?: boolean
  buscaChrome?: ReactNode
}) {
  const chrome = await resolverChromeCanalMural(canal, viewerTenantId, permissoes, {
    leituraOperador,
  })

  return (
    <CanalFeedComposition
      canal={canal}
      currentUser={currentUser}
      podePublicar={podePublicar}
      corPrimaria={chrome.corPrimaria}
      podeGerenciarAdmins={chrome.podeGerenciarAdmins}
      podeGerenciarMembros={chrome.podeGerenciarMembros}
      pedidosPendentesCount={chrome.pedidosPendentesCount}
      podeGerenciarPedidos={chrome.podeGerenciarPedidos}
      leituraOperador={leituraOperador}
      buscaChrome={buscaChrome}
      composer={
        <Suspense key="canal-composer" fallback={<ComposerFallback />}>
          <CanalComposerSection
            tenantId={viewerTenantId}
            userId={currentUser.id}
            userName={currentUser.nome}
            userAvatar={currentUser.avatarUrl}
            conversaId={canal.id}
            canalNome={canal.nome ?? canal.tenantNome}
          />
        </Suspense>
      }
    >
      {canal.souMembro || leituraOperador ? (
        <Suspense key="canal-posts" fallback={<CanalFeedFallback />}>
          <ComunidadePostsSection
            tenantId={viewerTenantId}
            currentUser={currentUser}
            cursor={cursor}
            filtro="canal"
            conversaId={canal.id}
            incluirFeedInterno={canal.canalOficial}
            podeCompartilhar={podeCompartilhar}
          />
        </Suspense>
      ) : null}
    </CanalFeedComposition>
  )
}
