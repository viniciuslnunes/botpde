import { getComposerContext } from '../../_components/composer-context'
import { FeedComposer } from '@/components/portal/feed-composer'

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
  const ctx = await getComposerContext(tenantId, userId, userName)

  return (
    <FeedComposer
      userId={userId}
      userName={ctx.nome}
      userAvatar={userAvatar}
      perfilPrivado={ctx.perfilPrivado}
      bloqueioPublicacao={ctx.bloqueioPublicacao}
      canal={{ conversaId, nome: canalNome }}
    />
  )
}
