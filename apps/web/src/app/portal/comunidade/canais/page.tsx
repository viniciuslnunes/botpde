import { redirect } from 'next/navigation'
import { Radio } from 'lucide-react'
import { auth } from '@/lib/auth'
import { getUserPermissionsInTenant } from '@/lib/tenant'
import { resolverContextoComunidade, resolverEscopoComunidade } from '@/lib/comunidade-contexto'
import {
  listCanaisVisiveis,
  listCanaisPublicosPorAfiliacao,
  ensureCanaisOficiaisHierarquia,
} from '@/lib/canais'
import { CanaisClient } from './canais-client'
import { ComunidadePageHeader } from '../_components/comunidade-page-header'
import {
  PERMISSIONS,
  calculateEffectivePermissions,
  formatNomeAfiliacao,
  hasPermission,
} from '@torcida/types'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Canais — Comunidade' }

export default async function CanaisPage({
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
    const nomeClube = formatNomeAfiliacao(ctx.afiliacao.apelido || ctx.afiliacao.nome)
    const canais = await listCanaisPublicosPorAfiliacao(ctx.afiliacao.id, session.user.id)

    return (
      <div className="space-y-5">
        <ComunidadePageHeader
          icon={Radio}
          titulo="Canais"
          subtitulo={`Canais públicos das torcidas de ${nomeClube} na plataforma`}
        />

        <CanaisClient
          canais={canais}
          podeCriarCanal={false}
          tenantAtualId={ctx.tenantSintetico.id}
        />
      </div>
    )
  }

  if (ctx.modo !== 'torcida') redirect('/portal/comunidade/canais?escopo=nacional')

  const tenant = ctx.tenant

  // Viewer como fallback de criadoPorId: canal de unidade pode nascer sem
  // ADMIN (propriedade atribuída depois); só satisfaz a FK se o tenant ainda
  // não tiver liderança/sócio.
  await ensureCanaisOficiaisHierarquia(tenant.id, session.user.id)

  const { rolePermissions, overrides } = await getUserPermissionsInTenant(
    session.user.id,
    tenant.id,
  )
  const efetivas = calculateEffectivePermissions(rolePermissions, overrides)
  const podeCriarCanal =
    hasPermission(efetivas, PERMISSIONS.CHANNELS_MANAGE) ||
    hasPermission(efetivas, PERMISSIONS.COMMUNITY_MANAGE)

  const canais = await listCanaisVisiveis(tenant.id, session.user.id)

  return (
    <div className="space-y-5">
      <ComunidadePageHeader
        icon={Radio}
        titulo="Canais"
        subtitulo="Unidades oficiais e comunidades temáticas — busque, filtre e ordene por proximidade"
      />

      <CanaisClient
        canais={canais}
        podeCriarCanal={podeCriarCanal}
        tenantAtualId={tenant.id}
      />
    </div>
  )
}
