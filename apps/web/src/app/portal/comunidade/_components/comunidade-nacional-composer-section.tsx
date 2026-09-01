import dynamic from 'next/dynamic'
import { getComposerContext } from './composer-context'
import { FeedComposerSkeleton } from '@/components/portal/feed-skeletons'
import { CARGO_TORCEDOR } from '@/lib/autor-badges-format'

const FeedComposer = dynamic(
  () => import('@/components/portal/feed-composer').then((mod) => mod.FeedComposer),
  { loading: () => <FeedComposerSkeleton /> },
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
        cargoNome: autorBadges?.cargoNome ?? CARGO_TORCEDOR,
        departamentoNome: autorBadges?.departamentoNome ?? null,
        sedeNome: autorBadges?.sedeNome ?? null,
        sedeTipo: autorBadges?.sedeTipo ?? null,
      }}
    />
  )
}
