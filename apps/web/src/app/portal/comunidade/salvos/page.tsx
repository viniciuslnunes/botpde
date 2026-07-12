import { redirect } from 'next/navigation'
import { Bookmark } from 'lucide-react'
import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'
import { getPostsSalvos } from '@/lib/feed'
import { FeedPostCard } from '@/components/portal/feed-post-card'
import { ComunidadePageHeader } from '../_components/comunidade-page-header'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Salvos — Comunidade' }

export default async function SalvosPage() {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id) redirect('/entrar')
  if (!tenant) redirect('/portal')

  const posts = await getPostsSalvos(tenant.id, session.user.id)

  const currentUser = {
    id: session.user.id,
    nome: session.user.name ?? null,
    avatarUrl: session.user.image ?? null,
  }

  return (
    <div className="space-y-5">
      <ComunidadePageHeader
        icon={Bookmark}
        titulo="Salvos"
        subtitulo="Publicações que você guardou para ler depois"
      />

      {posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[rgb(var(--border))] py-14 text-center">
          <Bookmark className="mb-3 h-9 w-9 text-[rgb(var(--foreground-muted))]" />
          <p className="text-sm font-semibold text-[rgb(var(--foreground))]">Nada salvo ainda</p>
          <p className="mt-1 max-w-xs text-xs text-[rgb(var(--foreground-muted))]">
            Toque em Salvar em qualquer publicação para encontrá-la aqui.
          </p>
        </div>
      ) : (
        <section className="space-y-4">
          {posts.map((post) => (
            <FeedPostCard
              key={post.id}
              post={post}
              showTenantBadge={post.tenantId !== tenant.id}
              currentUser={currentUser}
              salvo
            />
          ))}
        </section>
      )}
    </div>
  )
}
