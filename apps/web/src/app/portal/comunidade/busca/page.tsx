import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { Search } from 'lucide-react'
import { auth } from '@/lib/auth'
import { resolveTenantIdPortalComunidade } from '@/lib/comunidade-contexto'
import { getSugestoesMembrosParaBusca } from '@/lib/comunidade-busca'
import { BuscaMembrosClient } from './busca-membros-client'
import { ComunidadePageHeader } from '../_components/comunidade-page-header'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Buscar na Comunidade' }

export default async function BuscaMembrosPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/entrar')

  const tenantId = await resolveTenantIdPortalComunidade(session.user.id, session.user.email)
  const sugestoes =
    tenantId != null ? await getSugestoesMembrosParaBusca(tenantId, session.user.id) : []

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
