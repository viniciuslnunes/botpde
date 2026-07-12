import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'
import { getGrupoPorId, getPostsDoGrupo, getPostIdsSalvos } from '@/lib/feed'
import { GrupoDetalheClient } from './grupo-detalhe-client'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Grupo — Comunidade' }

export default async function GrupoDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id) redirect('/entrar')
  if (!tenant) redirect('/portal')

  const grupo = await getGrupoPorId(id, tenant.id, session.user.id)
  if (!grupo) notFound()
  if (!grupo.souMembro) redirect('/portal/comunidade/grupos')

  const [posts, salvoIds] = await Promise.all([
    getPostsDoGrupo(id, tenant.id, session.user.id),
    getPostIdsSalvos(session.user.id, tenant.id),
  ])

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link
        href="/portal/comunidade/grupos"
        className="inline-flex items-center gap-1.5 rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-1.5 pl-2 pr-3.5 text-sm font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))]"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar aos grupos
      </Link>

      <GrupoDetalheClient
        grupo={grupo}
        posts={posts}
        salvoIds={[...salvoIds]}
        currentUser={{
          id: session.user.id,
          nome: session.user.name ?? null,
          avatarUrl: session.user.image ?? null,
        }}
      />
    </div>
  )
}
