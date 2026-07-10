import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getTenantFromHost, getUserPermissionsInTenant } from '@/lib/tenant'
import { listCanaisVisiveis, listUnidadesVisiveis, getOrCreateCanalOficial } from '@/lib/canais'
import { CanaisClient } from './canais-client'
import { PERMISSIONS, calculateEffectivePermissions, hasPermission } from '@torcida/types'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Canais — Comunidade' }

export default async function CanaisPage() {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id) redirect('/entrar')
  if (!tenant) redirect('/portal')

  await getOrCreateCanalOficial(tenant.id)

  const { rolePermissions, overrides } = await getUserPermissionsInTenant(
    session.user.id,
    tenant.id,
  )
  const efetivas = calculateEffectivePermissions(rolePermissions, overrides)
  const podeCriarCanal =
    hasPermission(efetivas, PERMISSIONS.CHANNELS_MANAGE) ||
    hasPermission(efetivas, PERMISSIONS.COMMUNITY_MANAGE)

  const [canais, unidades] = await Promise.all([
    listCanaisVisiveis(tenant.id, session.user.id),
    listUnidadesVisiveis(tenant.id),
  ])

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link
        href="/portal/comunidade"
        className="inline-flex items-center text-sm text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
      >
        ← Voltar ao feed
      </Link>

      <header>
        <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Canais</h1>
        <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
          Perfis oficiais das unidades e comunidades temáticas da torcida
        </p>
      </header>

      <CanaisClient
        canais={canais}
        unidades={unidades}
        podeCriarCanal={podeCriarCanal}
        tenantAtualId={tenant.id}
      />
    </div>
  )
}
