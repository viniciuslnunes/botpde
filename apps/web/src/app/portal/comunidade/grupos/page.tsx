import { redirect } from 'next/navigation'
import { Users } from 'lucide-react'
import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'
import { getGruposDoTenant } from '@/lib/feed'
import { GruposClient } from './grupos-client'
import { ComunidadePageHeader } from '../_components/comunidade-page-header'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Grupos — Comunidade' }

export default async function GruposPage() {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id) redirect('/entrar')
  if (!tenant) redirect('/portal')

  const grupos = await getGruposDoTenant(tenant.id, session.user.id)

  return (
    <div className="space-y-5">
      <ComunidadePageHeader
        icon={Users}
        titulo="Grupos"
        subtitulo={`Comunidades temáticas da ${tenant.nome}`}
      />

      <GruposClient gruposIniciais={grupos} />
    </div>
  )
}
