import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'
import { getPostPorId } from '@/lib/feed'
import { getAvatarAtualDoUsuario } from '@/lib/perfil-social'
import { resolverAfiliacaoSlugContexto } from '@/lib/sofascore-server'
import { MotionReveal } from '@/components/motion/motion-reveal'
import { FeedPostCard } from '@/components/portal/feed-post-card'
import { WidgetSection } from '@/components/sofascore/widget-section'
import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Publicação — Comunidade' }
}

export default async function PostComunidadePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const [{ id }, session, tenant] = await Promise.all([
    params,
    auth(),
    getTenantFromHost(),
  ])
  if (!session?.user?.id) redirect('/entrar')
  if (!tenant) redirect('/portal')

  const post = await getPostPorId(id, tenant.id, session.user.id)
  if (!post) notFound()

  const afiliacaoSlug = await resolverAfiliacaoSlugContexto(tenant.afiliacaoId)

  const currentUser = {
    id: session.user.id,
    nome: session.user.name ?? null,
    avatarUrl: await getAvatarAtualDoUsuario(session.user.id),
  }

  return (
    <div className="space-y-4">
      <Link
        href="/portal/comunidade"
        className="inline-flex items-center text-sm text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
      >
        ← Voltar ao feed
      </Link>

      <MotionReveal>
        <FeedPostCard
          post={post}
          showTenantBadge={post.tenantId !== tenant.id}
          currentUser={currentUser}
          isAuthor={post.autorId === session.user.id}
        />
      </MotionReveal>

      <WidgetSection contexto="artigo" afiliacaoSlug={afiliacaoSlug} limit={1} />
    </div>
  )
}
