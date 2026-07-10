import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getTenantFromHost, getUserPermissionsInTenant } from '@/lib/tenant'
import { getPerfilInstitucional } from '@/lib/canais'
import { getPostIdsSalvos } from '@/lib/feed'
import { calculateEffectivePermissions } from '@torcida/types'
import { UnidadePerfilClient } from './unidade-perfil-client'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Unidade — Comunidade' }

export default async function UnidadePerfilPage({
  params,
}: {
  params: Promise<{ tenantId: string }>
}) {
  const { tenantId: targetTenantId } = await params
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id) redirect('/entrar')
  if (!tenant) redirect('/portal')

  const { rolePermissions, overrides } = await getUserPermissionsInTenant(
    session.user.id,
    tenant.id,
  )
  const permissoes = calculateEffectivePermissions(rolePermissions, overrides)

  const [perfil, salvoIds] = await Promise.all([
    getPerfilInstitucional(targetTenantId, tenant.id, session.user.id, permissoes),
    getPostIdsSalvos(session.user.id, tenant.id),
  ])
  if (!perfil) notFound()

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link
        href="/portal/comunidade/canais"
        className="inline-flex items-center text-sm text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
      >
        ← Voltar aos canais
      </Link>

      <UnidadePerfilClient
        perfil={perfil}
        salvoIds={[...salvoIds]}
        currentUser={{
          id: session.user.id,
          nome: session.user.name ?? null,
          avatarUrl: session.user.image ?? null,
        }}
        isPropriaUnidade={targetTenantId === tenant.id}
      />
    </div>
  )
}
