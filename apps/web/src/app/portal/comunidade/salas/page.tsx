import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { auth } from '@/lib/auth'
import { getTenantFromHost, getUserPermissionsInTenant } from '@/lib/tenant'
import { listSalasAtivas } from '@/lib/salas'
import { CriarSalaForm } from '@/components/portal/criar-sala-form'
import { SalasListAnimated } from '@/components/portal/salas-list-animated'
import { PERMISSIONS, calculateEffectivePermissions, hasPermission } from '@torcida/types'
import { db } from '@torcida/db'

export const metadata: Metadata = { title: 'Salas de vídeo' }

export default async function SalasPage() {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id) redirect('/entrar')
  if (!tenant) redirect('/portal')

  const [salas, eventos] = await Promise.all([
    listSalasAtivas(tenant.id),
    db.evento.findMany({
      where: { tenantId: tenant.id, data: { gte: new Date() } },
      select: { id: true, titulo: true },
      orderBy: { data: 'asc' },
      take: 30,
    }) as Promise<{ id: string; titulo: string }[]>,
  ])

  const { rolePermissions, overrides } = await getUserPermissionsInTenant(session.user.id, tenant.id)
  const effectivePermissions: string[] = calculateEffectivePermissions(rolePermissions, overrides)
  const canHost = hasPermission(effectivePermissions, PERMISSIONS.MEETINGS_HOST)

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/portal/comunidade"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))]"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar à comunidade
        </Link>
        <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Salas ao vivo</h1>
        <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
          Encontros em tempo real com áudio, vídeo, chat e compartilhamento de tela
        </p>
      </div>

      {canHost && <CriarSalaForm eventos={eventos} />}

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[rgb(var(--foreground))]">
          {salas.length > 0 && (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
          )}
          {salas.length > 0 ? `${salas.length} sala${salas.length === 1 ? '' : 's'} abertas` : 'Salas ativas'}
        </h2>

        <SalasListAnimated salas={salas} canHost={canHost} />
      </section>
    </div>
  )
}
