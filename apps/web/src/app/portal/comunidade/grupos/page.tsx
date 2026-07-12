import { redirect } from 'next/navigation'
import { Users } from 'lucide-react'
import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'
import { getGruposPublicos } from '@/lib/feed'
import { GruposClient } from './grupos-client'
import { ComunidadePageHeader } from '../_components/comunidade-page-header'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Grupos — Comunidade' }

export default async function GruposPage() {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id) redirect('/entrar')
  if (!tenant) redirect('/portal')

  const grupos = await getGruposPublicos(tenant.id, session.user.id)

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <ComunidadePageHeader
        icon={Users}
        titulo="Grupos"
        subtitulo={`Grupos temáticos abertos da ${tenant.nome}`}
      />

      <GruposClient gruposIniciais={grupos} />
    </div>
  )
}
