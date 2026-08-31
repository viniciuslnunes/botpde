import { redirect } from 'next/navigation'
import { Users } from 'lucide-react'
import {
  formatNomeAfiliacao,
  formatNomeTorcida,
  PERMISSIONS,
  calculateEffectivePermissions,
  hasPermission,
  MENSAGEM_CAPACIDADE_CONFIANCA,
} from '@torcida/types'
import { auth } from '@/lib/auth'
import { getUserPermissionsInTenant } from '@/lib/tenant'
import { temCapacidadeConfianca } from '@/lib/confianca'
import { resolverContextoComunidade, resolverEscopoComunidade } from '@/lib/comunidade-contexto'
import { lerMarcaCanalFoco } from '@/lib/comunidade-canal-foco-cookie'
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
    const nomeClube = formatNomeAfiliacao(ctx.afiliacao.apelido || ctx.afiliacao.nome)
    const grupos = await getGruposDoTenant(ctx.tenantSintetico.id, session.user.id)

    return (
      <div className="space-y-5">
        <ComunidadePageHeader
          icon={Users}
          titulo="Grupos"
          subtitulo={`Comunidades temáticas da torcida nacional de ${nomeClube}`}
        />

        <GruposClient gruposIniciais={grupos} podeCriarGrupo escopoNacional />
      </div>
    )
  }

  if (ctx.modo !== 'torcida') redirect('/portal/comunidade/grupos?escopo=nacional')

  const tenant = ctx.tenant
  const [grupos, marcaFoco, perms] = await Promise.all([
    getGruposDoTenant(tenant.id, session.user.id),
    lerMarcaCanalFoco(),
    getUserPermissionsInTenant(session.user.id, tenant.id),
  ])
  const efetivas = calculateEffectivePermissions(perms.rolePermissions, perms.overrides)
  const temPermGrupo = hasPermission(efetivas, PERMISSIONS.GROUPS_CREATE)
  const temCapGrupo = await temCapacidadeConfianca(session.user.id, tenant.id, 'grupo:criar')
  const podeCriarGrupo = temPermGrupo && temCapGrupo
  const hintCapacidade =
    temPermGrupo && !temCapGrupo ? MENSAGEM_CAPACIDADE_CONFIANCA['grupo:criar'] : null
  // Caso A: subtítulo segue o canal em foco (PDE), não o nome da Sede na sessão.
  const nomeContexto = marcaFoco?.nome ?? formatNomeTorcida(tenant.nome)

  return (
    <div className="space-y-5">
      <ComunidadePageHeader
        icon={Users}
        titulo="Grupos"
        subtitulo={`Comunidades temáticas da ${nomeContexto}`}
      />

      <GruposClient
        gruposIniciais={grupos}
        podeCriarGrupo={podeCriarGrupo}
        hintCapacidade={hintCapacidade}
      />
    </div>
  )
}
