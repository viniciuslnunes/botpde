import dynamic from 'next/dynamic'
import { getComposerContext } from './composer-context'
import { FeedComposerSkeleton } from '@/components/portal/feed-skeletons'
import { CARGO_TORCEDOR } from '@/lib/autor-badges-format'
import type { EscopoComunidade } from '@/lib/comunidade-escopo'
import type { TorcidaRealComunidade } from '@/lib/comunidade-contexto'

const FeedComposer = dynamic(
  () => import('@/components/portal/feed-composer').then((mod) => mod.FeedComposer),
  { loading: () => <FeedComposerSkeleton /> },
)

/**
 * Composer do fórum — o mesmo `FeedComposer` do feed (mídia, menções, emoji),
 * com `forum` (sem enquete/evento/alcance). Publica via `criarTopicoComposerAction`.
 */
export async function ComunidadeForumComposerSection({
  escopo,
  tenantId,
  tenantNome,
  userId,
  userName,
  userAvatar,
  torcidaReal,
  filaAprovacao = false,
}: {
  escopo: EscopoComunidade
  tenantId: string
  tenantNome: string
  userId: string
  userName: string | null
  userAvatar: string | null
  torcidaReal?: TorcidaRealComunidade | null
  filaAprovacao?: boolean
}) {
  const autorTenantId = escopo === 'nacional' ? (torcidaReal?.id ?? null) : tenantId
  const ctx = autorTenantId
    ? await getComposerContext(autorTenantId, userId, userName)
    : null
  const bloqueio = escopo === 'nacional' ? null : (ctx?.bloqueioPublicacao ?? null)

  return (
    <FeedComposer
      userId={userId}
      userName={ctx?.nome ?? userName}
      userAvatar={userAvatar}
      tenantId={tenantId}
      tenantNome={torcidaReal?.nome ?? tenantNome}
      forum={escopo}
      forumFilaAprovacao={filaAprovacao}
      bloqueioPublicacao={bloqueio}
      somentePublico={escopo === 'nacional' ? false : Boolean(ctx?.somentePublico)}
      autorBadges={{
        cargoNome: ctx?.userCard.cargoNome ?? CARGO_TORCEDOR,
        departamentoNome: ctx?.userCard.departamentoNome ?? null,
        sedeNome: ctx?.userCard.sedeNome ?? null,
        sedeTipo: ctx?.userCard.sedeTipo ?? null,
      }}
    />
  )
}
