import dynamic from 'next/dynamic'
import { getComposerContext } from './composer-context'

const FeedComposer = dynamic(
  () => import('@/components/portal/feed-composer').then((mod) => mod.FeedComposer),
  {
    loading: () => (
      <div className="h-24 animate-pulse rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]" />
    ),
  },
)

export async function ComunidadeComposerSection({
  tenantId,
  userId,
  userName,
  userAvatar,
}: {
  tenantId: string
  userId: string
  userName: string | null
  userAvatar: string | null
}) {
  const ctx = await getComposerContext(tenantId, userId, userName)

  return (
    <FeedComposer
      userName={ctx.nome}
      userAvatar={userAvatar}
      perfilPrivado={ctx.perfilPrivado}
      eventos={ctx.eventosComposer}
      bloqueioPublicacao={ctx.bloqueioPublicacao}
      somentePublico={ctx.somentePublico}
      podePublicarNacional={ctx.podePublicarNacional}
    />
  )
}
