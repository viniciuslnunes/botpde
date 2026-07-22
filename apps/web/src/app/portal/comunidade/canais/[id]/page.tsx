import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getTenantFromHost, getUserPermissionsInTenant } from '@/lib/tenant'
import { getCanalPorId, podePublicarNoCanal } from '@/lib/canais'
import { getAvatarAtualDoUsuario } from '@/lib/perfil-social'
import { listSalasAtivas } from '@/lib/salas'
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
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id) redirect('/entrar')
  if (!tenant) redirect('/portal')

  const { rolePermissions, overrides } = await getUserPermissionsInTenant(
    session.user.id,
    tenant.id,
  )
  const permissoes = calculateEffectivePermissions(rolePermissions, overrides)

  const canal = await getCanalPorId(id, tenant.id, session.user.id)
  if (!canal) notFound()

  const [podePublicar, salasAtivas] = await Promise.all([
    podePublicarNoCanal(canal, tenant.id, permissoes),
    listSalasAtivas(tenant.id),
  ])

  const currentUser = {
    id: session.user.id,
    nome: session.user.name ?? null,
    avatarUrl: await getAvatarAtualDoUsuario(session.user.id),
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <ComunidadeAsideRail tenant={tenant} currentUser={currentUser} salasAtivas={salasAtivas} />

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
        />
      </div>
    </div>
  )
}
