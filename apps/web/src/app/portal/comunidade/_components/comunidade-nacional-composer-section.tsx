import { ComunidadeNacionalComposer } from './comunidade-nacional-composer'
import { getComposerContext } from './composer-context'

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
    <ComunidadeNacionalComposer
      currentUser={{ id: userId, nome: userName, avatarUrl: userAvatar }}
      tenantId={tenantId}
      tenantNome={torcidaReal?.nome ?? tenantNome}
      autorBadges={
        autorBadges
          ? {
              cargoNome: autorBadges.cargoNome,
              departamentoNome: autorBadges.departamentoNome,
              sedeNome: autorBadges.sedeNome,
            }
          : undefined
      }
    />
  )
}
