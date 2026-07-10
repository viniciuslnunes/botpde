import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getTenantFromHost, getUserPermissionsInTenant } from '@/lib/tenant'
import { getCanalPorId, getPostsDoCanal, podePublicarNoCanal } from '@/lib/canais'
import { getPostIdsSalvos } from '@/lib/feed'
import { calculateEffectivePermissions } from '@torcida/types'
import { CanalDetalheClient } from './canal-detalhe-client'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Canal — Comunidade' }

export default async function CanalDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id) redirect('/entrar')
  if (!tenant) redirect('/portal')

  const { rolePermissions, overrides } = await getUserPermissionsInTenant(
    session.user.id,
    tenant.id,
  )
  const permissoes = calculateEffectivePermissions(rolePermissions, overrides)

  const canal = await getCanalPorId(id, tenant.id, session.user.id)
  if (!canal) notFound()

  const [posts, salvoIds] = await Promise.all([
    canal.souMembro ? getPostsDoCanal(id, canal.tenantId, session.user.id) : Promise.resolve([]),
    getPostIdsSalvos(session.user.id, tenant.id),
  ])

  const podePublicar = await podePublicarNoCanal(canal, tenant.id, permissoes)

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link
        href="/portal/comunidade/canais"
        className="inline-flex items-center text-sm text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
      >
        ← Voltar aos canais
      </Link>

      <CanalDetalheClient
        canal={canal}
        posts={posts}
        salvoIds={[...salvoIds]}
        currentUser={{
          id: session.user.id,
          nome: session.user.name ?? null,
          avatarUrl: session.user.image ?? null,
        }}
        podePublicar={podePublicar || !canal.somenteAdminPublica}
      />
    </div>
  )
}
