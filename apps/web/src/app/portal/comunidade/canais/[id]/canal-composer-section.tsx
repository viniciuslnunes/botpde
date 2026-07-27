import { getComposerContext } from '../../_components/composer-context'
import { FeedComposer } from '@/components/portal/feed-composer'
import { db } from '@torcida/db'

/**
 * Composer do canal — mesmo `FeedComposer` do feed principal (mídia, menções,
 * emoji, sticker), preso ao mural do canal via `canal.conversaId`. Sem
 * enquete/evento/alcance: visibilidade é sempre "membros do canal".
 */
export async function CanalComposerSection({
  tenantId,
  userId,
  userName,
  userAvatar,
  conversaId,
  canalNome,
}: {
  tenantId: string
  userId: string
  userName: string | null
  userAvatar: string | null
  conversaId: string
  canalNome: string | null
}) {
  const [ctx, tenant] = await Promise.all([
    getComposerContext(tenantId, userId, userName),
    db.tenant.findUnique({ where: { id: tenantId }, select: { nome: true } }),
  ])

  return (
    <FeedComposer
      userId={userId}
      userName={ctx.nome}
      userAvatar={userAvatar}
      tenantId={tenantId}
      tenantNome={tenant?.nome ?? 'Torcida'}
      perfilPrivado={ctx.perfilPrivado}
      // Gate de publicação é `podePublicarNoCanal` (só mostra o composer se
      // liberado) — não reusa o bloqueio do feed (`community:post`).
      bloqueioPublicacao={null}
      canal={{ conversaId, nome: canalNome }}
    />
  )
}
