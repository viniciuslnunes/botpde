import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'
import { getPostsComVideo } from '@/lib/feed'
import { VideosPageClient } from './videos-page-client'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Vídeos — Comunidade' }

export default async function VideosPage() {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id) redirect('/entrar')
  if (!tenant) redirect('/portal')

  const posts = await getPostsComVideo(tenant.id, session.user.id)

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link
        href="/portal/comunidade"
        className="inline-flex items-center text-sm text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
      >
        ← Voltar ao feed
      </Link>

      <header>
        <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Vídeos</h1>
        <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
          Reels e publicações com vídeo da comunidade
        </p>
      </header>

      <VideosPageClient posts={posts} />
    </div>
  )
}
