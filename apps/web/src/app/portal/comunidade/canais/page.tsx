import { redirect } from 'next/navigation'
import { Radio } from 'lucide-react'
import { auth } from '@/lib/auth'
import { getTenantFromHost, getUserPermissionsInTenant } from '@/lib/tenant'
import { listCanaisVisiveis, getOrCreateCanalOficial } from '@/lib/canais'
import { isSuperAdminEmail, listarVinculosAprovadosDoUsuario } from '@/lib/tenant-context'
import { CanaisClient } from './canais-client'
import { ComunidadePageHeader } from '../_components/comunidade-page-header'
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

  const isSuperAdmin = isSuperAdminEmail(session.user.email)

  const [canais, vinculos] = await Promise.all([
    listCanaisVisiveis(tenant.id, session.user.id),
    isSuperAdmin ? Promise.resolve([]) : listarVinculosAprovadosDoUsuario(session.user.id),
  ])

  return (
    <div className="space-y-5">
      <ComunidadePageHeader
        icon={Radio}
        titulo="Canais"
        subtitulo="Perfis oficiais das unidades e comunidades temáticas da torcida"
      />

      <CanaisClient
        canais={canais}
        vinculos={vinculos}
        tenantSlugAtual={tenant.slug}
        podeCriarCanal={podeCriarCanal}
        tenantAtualId={tenant.id}
      />
    </div>
  )
}
