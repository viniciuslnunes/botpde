import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getUserPermissionsInTenant } from '@/lib/tenant'
import { resolveTenantMinhaTorcida } from '@/lib/comunidade-contexto'
import { getCanalPorId, podePublicarNoCanal } from '@/lib/canais'
import { podeVerFeedSocios } from '@/lib/feed'
import { getAvatarAtualDoUsuario } from '@/lib/perfil-social'
import { ComunidadeAsideRail } from '../../_components/comunidade-aside-rail'
import { calculateEffectivePermissions } from '@torcida/types'
import { CanalFeedView } from './canal-feed-view'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Canal — Comunidade' }

export default async function CanalDetalhePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ cursor?: string }>
}) {
  const { id } = await params
  const { cursor } = await searchParams
  const session = await auth()
  if (!session?.user?.id) redirect('/entrar')
  const tenant = await resolveTenantMinhaTorcida(session.user.id, session.user.email)
  if (!tenant) redirect('/portal/comunidade?escopo=nacional')

  const { rolePermissions, overrides } = await getUserPermissionsInTenant(
    session.user.id,
    tenant.id,
  )
  const permissoes = calculateEffectivePermissions(rolePermissions, overrides)

  const canal = await getCanalPorId(id, tenant.id, session.user.id)
  if (!canal) notFound()

  const [podePublicar, ehSocio, avatarUrl] = await Promise.all([
    podePublicarNoCanal(canal, tenant.id, permissoes),
    podeVerFeedSocios(session.user.id, tenant.id),
    getAvatarAtualDoUsuario(session.user.id),
  ])

  const currentUser = {
    id: session.user.id,
    nome: session.user.name ?? null,
    avatarUrl,
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <ComunidadeAsideRail tenant={tenant} currentUser={currentUser} />

      <div className="min-w-0 space-y-4">
        <Link
          href="/portal/comunidade/canais"
          className="inline-flex items-center gap-1.5 rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-1.5 pl-2 pr-3.5 text-sm font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))]"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar aos canais
        </Link>

        <CanalFeedView
          canal={canal}
          currentUser={currentUser}
          podePublicar={podePublicar || !canal.somenteAdminPublica}
          cursor={cursor}
          viewerTenantId={tenant.id}
          permissoes={permissoes}
          podeCompartilhar={ehSocio}
        />
      </div>
    </div>
  )
}
