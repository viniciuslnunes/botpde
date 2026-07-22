import { redirect } from 'next/navigation'
import { Users } from 'lucide-react'
import { auth } from '@/lib/auth'
import { resolverContextoComunidade, resolverEscopoComunidade } from '@/lib/comunidade-contexto'
import { getGruposDoTenant } from '@/lib/feed'
import { GruposClient } from './grupos-client'
import { ComunidadePageHeader } from '../_components/comunidade-page-header'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Grupos — Comunidade' }

export default async function GruposPage({
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

  if (escopo === 'nacional' && ctx.afiliacao && ctx.tenantSintetico) {
    const nomeClube = ctx.afiliacao.apelido || ctx.afiliacao.nome
    const grupos = await getGruposDoTenant(ctx.tenantSintetico.id, session.user.id)

    return (
      <div className="space-y-5">
        <ComunidadePageHeader
          icon={Users}
          titulo="Grupos"
          subtitulo={`Comunidades temáticas da torcida nacional de ${nomeClube}`}
        />

        <GruposClient gruposIniciais={grupos} />
      </div>
    )
  }

  if (ctx.modo !== 'torcida') redirect('/portal/comunidade/grupos?escopo=nacional')

  const tenant = ctx.tenant
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
