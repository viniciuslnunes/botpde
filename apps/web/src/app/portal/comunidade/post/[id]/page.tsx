import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { auth } from '@/lib/auth'
import { resolveTenantIdPortalComunidade, resolverContextoComunidade } from '@/lib/comunidade-contexto'
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
  const session = await auth()
  if (!session?.user?.id) redirect('/entrar')

  const [{ id }, tenantId, ctx] = await Promise.all([
    params,
    resolveTenantIdPortalComunidade(session.user.id, session.user.email),
    resolverContextoComunidade(session.user.id, session.user.email),
  ])
  if (!tenantId) redirect('/portal')

  const post = await getPostPorId(id, tenantId, session.user.id)
  if (!post) notFound()

  const afiliacaoSlug = await resolverAfiliacaoSlugContexto(ctx?.afiliacao?.id ?? null)

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
          showTenantBadge={post.tenantId !== tenantId}
          currentUser={currentUser}
          isAuthor={post.autorId === session.user.id}
        />
      </MotionReveal>

      <WidgetSection contexto="artigo" afiliacaoSlug={afiliacaoSlug} limit={1} />
    </div>
  )
}
