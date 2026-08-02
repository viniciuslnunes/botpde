import { redirect } from 'next/navigation'
import { Video } from 'lucide-react'
import { auth } from '@/lib/auth'
import { resolveTenantMinhaTorcida } from '@/lib/comunidade-contexto'
import { getPostsComVideo } from '@/lib/feed'
import { getAvatarAtualDoUsuario } from '@/lib/perfil-social'
import { VideosPageClient } from './videos-page-client'
import { ComunidadePageHeader } from '../_components/comunidade-page-header'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Vídeos — Comunidade' }

export default async function VideosPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/entrar')
  const tenant = await resolveTenantMinhaTorcida(session.user.id, session.user.email)
  if (!tenant) redirect('/portal/comunidade?escopo=nacional')

  const posts = await getPostsComVideo(tenant.id, session.user.id)

  return (
    <div className="space-y-5">
      <ComunidadePageHeader
        icon={Video}
        titulo="Vídeos"
        subtitulo="Clipes da torcida — deslize, curta e publique o seu"
      />

      <VideosPageClient
        posts={posts}
        tenantId={tenant.id}
        currentUser={{
          id: session.user.id,
          nome: session.user.name ?? null,
          avatarUrl: await getAvatarAtualDoUsuario(session.user.id),
        }}
      />
    </div>
  )
}
