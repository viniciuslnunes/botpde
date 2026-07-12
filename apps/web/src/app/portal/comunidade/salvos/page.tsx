import { redirect } from 'next/navigation'
import { Bookmark } from 'lucide-react'
import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'
import { getPostsSalvos } from '@/lib/feed'
import { ComunidadePostsAnimated } from '../_components/comunidade-posts-animated'
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

      <ComunidadePostsAnimated
        posts={posts}
        currentUser={currentUser}
        tenantId={tenant.id}
        showTenantBadge="auto"
        salvoIds={posts.map((p) => p.id)}
        emptyIcon={<Bookmark className="mb-3 h-9 w-9 text-[rgb(var(--foreground-muted))]" />}
        emptyTitle="Nada salvo ainda"
        emptyDescription="Toque em Salvar em qualquer publicação para encontrá-la aqui."
        emptyClassName="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[rgb(var(--border))] py-14 text-center"
      />
    </div>
  )
}
