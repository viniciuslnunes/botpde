import dynamic from 'next/dynamic'
import { getComposerContext } from './composer-context'
import { FeedComposerSkeleton } from '@/components/portal/feed-skeletons'
import type { EscopoComunidade } from '@/lib/comunidade-escopo'
import type { TorcidaRealComunidade } from '@/lib/comunidade-contexto'

const NoticiaStoryComposer = dynamic(
  () => import('@/components/portal/noticia-story-composer').then((mod) => mod.NoticiaStoryComposer),
  { loading: () => <FeedComposerSkeleton /> },
)

/**
 * Composer da praça de notícias — mesmo chrome do feed/comunicado
 * (avatar, campos, barra, prévia), com história em blocos.
 */
export async function ComunidadeNoticiasComposerSection({
  escopo,
  tenantId,
  tenantNome,
  userId,
  userName,
  userAvatar,
  torcidaReal,
  fecharHref,
  focoVideo = false,
}: {
  escopo: EscopoComunidade
  tenantId: string
  tenantNome: string
  userId: string
  userName: string | null
  userAvatar: string | null
  torcidaReal?: TorcidaRealComunidade | null
  fecharHref: string
  focoVideo?: boolean
}) {
  const ctx = await getComposerContext(tenantId, userId, userName)

  return (
    <NoticiaStoryComposer
      escopo={escopo}
      userName={ctx.nome ?? userName}
      userAvatar={userAvatar}
      tenantNome={torcidaReal?.nome ?? tenantNome}
      fecharHref={fecharHref}
      focoVideo={focoVideo}
    />
  )
}
