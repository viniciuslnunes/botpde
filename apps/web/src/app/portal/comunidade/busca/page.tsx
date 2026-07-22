import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { Search } from 'lucide-react'
import { auth } from '@/lib/auth'
import {
  resolverContextoComunidade,
  resolverEscopoComunidade,
} from '@/lib/comunidade-contexto'
import { getSugestoesMembrosParaBusca } from '@/lib/comunidade-busca'
import { BuscaMembrosClient } from './busca-membros-client'
import { ComunidadePageHeader } from '../_components/comunidade-page-header'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Buscar na Comunidade' }

export default async function BuscaMembrosPage({
  searchParams,
}: {
  searchParams: Promise<{ escopo?: string }>
}) {
  const params = await searchParams
  const session = await auth()
  if (!session?.user?.id) redirect('/entrar')

  const ctx = await resolverContextoComunidade(session.user.id, session.user.email)
  if (!ctx) redirect('/portal')

  const escopoDesejado = resolverEscopoComunidade(ctx, params.escopo)
  const escopo = escopoDesejado === 'nacional' && !ctx.afiliacao ? 'torcida' : escopoDesejado

  let tenantId: string | null = null
  let subtitulo = 'Encontre membros, hashtags em alta e publicações.'

  if (escopo === 'nacional' && ctx.afiliacao && ctx.tenantSintetico) {
    tenantId = ctx.tenantSintetico.id
    const nomeClube = ctx.afiliacao.apelido || ctx.afiliacao.nome
    subtitulo = `Encontre torcedores e sócios de ${nomeClube}, hashtags e publicações.`
  } else if (ctx.modo === 'torcida') {
    tenantId = ctx.tenant.id
  } else if (ctx.tenantSintetico) {
    redirect('/portal/comunidade/busca?escopo=nacional')
  }

  const sugestoes =
    tenantId != null ? await getSugestoesMembrosParaBusca(tenantId, session.user.id) : []

  return (
    <div className="space-y-5">
      <ComunidadePageHeader
        icon={Search}
        titulo="Buscar na comunidade"
        subtitulo={subtitulo}
      />
      <Suspense fallback={<div className="h-11 animate-pulse rounded-xl bg-[rgb(var(--border))]" />}>
        <BuscaMembrosClient sugestoesIniciais={sugestoes} escopo={escopo} />
      </Suspense>
    </div>
  )
}
