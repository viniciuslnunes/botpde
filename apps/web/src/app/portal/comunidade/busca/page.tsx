import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { Search } from 'lucide-react'
import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'
import { getSugestoesMembrosParaBusca } from '@/lib/comunidade-busca'
import { BuscaMembrosClient } from './busca-membros-client'
import { ComunidadePageHeader } from '../_components/comunidade-page-header'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Buscar na Comunidade' }

export default async function BuscaMembrosPage() {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id) redirect('/entrar')

  const sugestoes =
    tenant != null ? await getSugestoesMembrosParaBusca(tenant.id, session.user.id) : []

  return (
    <div className="space-y-5">
      <ComunidadePageHeader
        icon={Search}
        titulo="Buscar na comunidade"
        subtitulo="Encontre membros, hashtags em alta e publicações."
      />
      <Suspense fallback={<div className="h-11 animate-pulse rounded-xl bg-[rgb(var(--border))]" />}>
        <BuscaMembrosClient sugestoesIniciais={sugestoes} />
      </Suspense>
    </div>
  )
}
