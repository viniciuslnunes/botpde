import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Users, Heart } from 'lucide-react'
import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'
import { getPostsDaRede } from '@/lib/feed'
import { ComunidadePostsAnimated } from '../_components/comunidade-posts-animated'
import { ComunidadePageHeader } from '../_components/comunidade-page-header'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Minha rede — Comunidade' }

export default async function RedeComunidadePage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>
}) {
  const [params, session, tenant] = await Promise.all([
    searchParams,
    auth(),
    getTenantFromHost(),
  ])
  if (!session?.user?.id) redirect('/entrar')
  if (!tenant) redirect('/portal')

  const { posts, pageInfo } = await getPostsDaRede(tenant.id, session.user.id, {
    cursor: params.cursor,
    take: 20,
  })

  const currentUser = {
    id: session.user.id,
    nome: session.user.name ?? null,
    avatarUrl: session.user.image ?? null,
  }

  return (
    <div className="space-y-5">
      <ComunidadePageHeader
        icon={Heart}
        titulo="Minha rede"
        subtitulo="Publicações de quem você segue e as suas"
      />

      <ComunidadePostsAnimated
        posts={posts}
        currentUser={currentUser}
        tenantId={tenant.id}
        showTenantBadge="auto"
        emptyIcon={<Users className="mb-3 h-9 w-9 text-[rgb(var(--foreground-muted))]" />}
        emptyTitle="Sua rede ainda está vazia"
        emptyDescription={
          <>
            Siga outros membros ou publique algo para ver atividade aqui.{' '}
            <Link
              href="/portal/comunidade/busca"
              className="mt-4 inline-block rounded-full bg-[rgb(var(--primary))] px-5 py-2 text-sm font-semibold text-white shadow-sm shadow-[rgb(var(--primary)_/_0.3)] transition-opacity hover:opacity-90"
            >
              Buscar membros
            </Link>
          </>
        }
        emptyClassName="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[rgb(var(--border))] py-14 text-center"
      />

      {pageInfo.hasMore && pageInfo.nextCursor && (
        <div className="flex justify-center pt-2">
          <Link
            href={`/portal/comunidade/rede?cursor=${encodeURIComponent(pageInfo.nextCursor)}`}
            className="rounded-full border border-[rgb(var(--border))] px-5 py-2 text-sm font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
          >
            Carregar mais
          </Link>
        </div>
      )}
    </div>
  )
}
