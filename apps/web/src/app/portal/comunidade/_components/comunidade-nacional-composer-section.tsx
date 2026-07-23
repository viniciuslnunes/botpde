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

/**
 * Composer da aba Nacional — mesmo `FeedComposer` da torcida (mídia, vídeo,
 * menções, emoji, stickers), com `nacional` (sempre PUBLICO, sem
 * enquete/evento/alcance). Publica via `publicarPostNacional`.
 */
export async function ComunidadeNacionalComposerSection({
  tenantId,
  tenantNome,
  userId,
  userName,
  userAvatar,
  torcidaReal,
}: {
  tenantId: string
  tenantNome: string
  userId: string
  userName: string | null
  userAvatar: string | null
  torcidaReal?: { id: string; nome: string } | null
}) {
  const autorBadges = torcidaReal
    ? (await getComposerContext(torcidaReal.id, userId, userName)).userCard
    : null

  return (
    <FeedComposer
      userId={userId}
      userName={userName}
      userAvatar={userAvatar}
      tenantId={tenantId}
      tenantNome={torcidaReal?.nome ?? tenantNome}
      nacional
      autorBadges={{
        cargoNome: autorBadges?.cargoNome ?? 'Torcedor',
        departamentoNome: autorBadges?.departamentoNome ?? null,
        sedeNome: autorBadges?.sedeNome ?? null,
      }}
    />
  )
}
