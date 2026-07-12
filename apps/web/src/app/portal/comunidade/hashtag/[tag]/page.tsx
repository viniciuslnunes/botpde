import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'
import { getPostsPorHashtag } from '@/lib/feed'
import { ComunidadePostsAnimated } from '../../_components/comunidade-posts-animated'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Hashtag — Comunidade' }

export default async function HashtagPage({
  params,
}: {
  params: Promise<{ tag: string }>
}) {
  const [{ tag }, session, tenant] = await Promise.all([
    params,
    auth(),
    getTenantFromHost(),
  ])
  if (!session?.user?.id) redirect('/entrar')
  if (!tenant) redirect('/portal')

  const { tag: normalized, posts } = await getPostsPorHashtag(
    tenant.id,
    decodeURIComponent(tag),
    session.user.id,
  )

  const currentUser = {
    id: session.user.id,
    nome: session.user.name ?? null,
    avatarUrl: session.user.image ?? null,
  }

  return (
    <div className="space-y-4">
      <Link
        href="/portal/comunidade"
        className="inline-flex items-center text-sm text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
      >
        ← Voltar ao feed
      </Link>

      <header>
        <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">#{normalized}</h1>
        <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
          {posts.length} publicação{posts.length === 1 ? '' : 'ões'} com esta hashtag
        </p>
      </header>

      <ComunidadePostsAnimated
        posts={posts}
        currentUser={currentUser}
        tenantId={tenant.id}
        showTenantBadge="auto"
        emptyTitle={`Nenhuma publicação com #${normalized} ainda.`}
      />
    </div>
  )
}
