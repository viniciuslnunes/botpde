import { redirect } from 'next/navigation'
import { Video } from 'lucide-react'
import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'
import { getPostsComVideo } from '@/lib/feed'
import { VideosPageClient } from './videos-page-client'
import { ComunidadePageHeader } from '../_components/comunidade-page-header'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Vídeos — Comunidade' }

export default async function VideosPage() {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id) redirect('/entrar')
  if (!tenant) redirect('/portal')

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
          avatarUrl: session.user.image ?? null,
        }}
      />
    </div>
  )
}
