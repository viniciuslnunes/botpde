import { Suspense } from 'react'
import { db } from '@torcida/db'
import {
  listMembrosCanal,
  listPedidosCanal,
  podeGerenciarPedidosCanal,
  type CanalItem,
} from '@/lib/canais'
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
    <div className="space-y-4">
      <div className="h-24 animate-pulse rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]" />
      <div className="h-32 animate-pulse rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]" />
      <div className="h-32 animate-pulse rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]" />
    </div>
  )
}

function ComposerFallback() {
  return (
    <div className="h-24 animate-pulse rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]" />
  )
}

/**
 * Visão unificada de canal (oficial ou temático): cabeçalho fino + composer
 * leve + mesma lista/paginação infinita do feed principal. Usada tanto por
 * `/canais/[id]` quanto (via redirect) por `/unidade/[tenantId]`.
 */
export async function CanalFeedView({
  canal,
  currentUser,
  podePublicar,
  cursor,
  viewerTenantId,
  permissoes,
}: {
  canal: CanalItem
  currentUser: CurrentUser
  podePublicar: boolean
  cursor?: string
  /** Tenant ativo de quem está vendo — o composer publica sempre nele (via `assertPermission`), não em `canal.tenantId`. */
  viewerTenantId: string
  /** Permissões efetivas do viewer no tenant ativo — gate de "Pedidos pendentes". */
  permissoes: string[]
}) {
  const podeGerenciarAdmins = canal.souAdmin && !canal.canalOficial
  const podeGerenciarPedidos =
    !canal.publica && (await podeGerenciarPedidosCanal(canal, viewerTenantId, permissoes))

  const [tenant, membros, pedidos] = await Promise.all([
    db.tenant.findUnique({ where: { id: canal.tenantId }, select: { corPrimaria: true } }),
    podeGerenciarAdmins ? listMembrosCanal(canal.id) : Promise.resolve([]),
    podeGerenciarPedidos ? listPedidosCanal(canal.id) : Promise.resolve([]),
  ])

  return (
    <CanalFeedComposition
      canal={canal}
      currentUser={currentUser}
      podePublicar={podePublicar}
      corPrimaria={tenant?.corPrimaria ?? '#7c3aed'}
      membros={membros}
      podeGerenciarAdmins={podeGerenciarAdmins}
      pedidos={pedidos}
      podeGerenciarPedidos={podeGerenciarPedidos}
      composer={
        <Suspense fallback={<ComposerFallback />}>
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
      {canal.souMembro ? (
        <Suspense fallback={<CanalFeedFallback />}>
          <ComunidadePostsSection
            tenantId={canal.tenantId}
            currentUser={currentUser}
            cursor={cursor}
            filtro="canal"
            conversaId={canal.id}
          />
        </Suspense>
      ) : null}
    </CanalFeedComposition>
  )
}
