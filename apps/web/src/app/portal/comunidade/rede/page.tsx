import { redirect } from 'next/navigation'
import { Heart } from 'lucide-react'
import { auth } from '@/lib/auth'
import { resolveTenantMinhaTorcida } from '@/lib/comunidade-contexto'
import { getPostIdsSalvos, getPostsDaRede } from '@/lib/feed'
import { getAvatarAtualDoUsuario } from '@/lib/perfil-social'
import { ComunidadeRedeInfinite } from '../_components/comunidade-rede-infinite'
import { ComunidadePageHeader } from '../_components/comunidade-page-header'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Minha rede — Comunidade' }

export default async function RedeComunidadePage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>
}) {
  const [params, session] = await Promise.all([searchParams, auth()])
  if (!session?.user?.id) redirect('/entrar')
  const tenant = await resolveTenantMinhaTorcida(session.user.id, session.user.email)
  if (!tenant) redirect('/portal/comunidade?escopo=nacional')

  const { posts, pageInfo } = await getPostsDaRede(tenant.id, session.user.id, {
    cursor: params.cursor,
    take: 20,
  })

  const salvoIds = await getPostIdsSalvos(session.user.id, tenant.id)

  const currentUser = {
    id: session.user.id,
    nome: session.user.name ?? null,
    avatarUrl: await getAvatarAtualDoUsuario(session.user.id),
  }

  return (
    <div className="space-y-5">
      <ComunidadePageHeader
        icon={Heart}
        titulo="Minha rede"
        subtitulo="Publicações de quem você segue e as suas"
      />

      <ComunidadeRedeInfinite
        tenantId={tenant.id}
        currentUser={currentUser}
        initialPosts={posts}
        initialPageInfo={pageInfo}
        initialCursor={params.cursor ?? null}
        salvoIds={[...salvoIds]}
      />
    </div>
  )
}
