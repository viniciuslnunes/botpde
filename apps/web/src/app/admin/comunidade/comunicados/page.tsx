import { Suspense } from 'react'
import { db } from '@torcida/db'
import { auth } from '@/lib/auth'
import { getTenantFromHost, getUserPermissionsInTenant } from '@/lib/tenant'
import { redirect } from 'next/navigation'
import { Megaphone } from 'lucide-react'
import { PERMISSIONS, calculateEffectivePermissions, hasPermission } from '@torcida/types'
import { ComunicadosManager } from '@/components/admin/comunicado-forms'
import { ComunicadoComposerAdmin } from '@/components/admin/comunicado-composer'
import { MotionReveal } from '@/components/motion/motion-reveal'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Comunicados — Comunidade' }

interface ComunicadoRaw {
  id: string
  titulo: string
  corpo: string
  prioridade: 'NORMAL' | 'IMPORTANTE' | 'URGENTE'
  fixado: boolean
  publicadoEm: Date
  reposts: { midiaUrls: string[] }[]
}

export default async function AdminComunicadosPage() {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id || !tenant) redirect('/admin')

  const { rolePermissions, overrides } = await getUserPermissionsInTenant(session.user.id, tenant.id)
  const effective = calculateEffectivePermissions(rolePermissions, overrides)
  if (!hasPermission(effective, PERMISSIONS.ANNOUNCEMENTS_PUBLISH)) redirect('/admin/comunidade')

  const comunicadosRaw: ComunicadoRaw[] = await db.announcement.findMany({
    where: { tenantId: tenant.id },
    orderBy: [{ fixado: 'desc' }, { publicadoEm: 'desc' }],
    select: {
      id: true,
      titulo: true,
      corpo: true,
      prioridade: true,
      fixado: true,
      publicadoEm: true,
      reposts: {
        where: { tipo: 'INSTITUCIONAL' },
        select: { midiaUrls: true },
        orderBy: { criadoEm: 'desc' },
        take: 1,
      },
    },
  })

  const comunicados = comunicadosRaw.map((c) => ({
    id: c.id,
    titulo: c.titulo,
    corpo: c.corpo,
    prioridade: c.prioridade,
    fixado: c.fixado,
    publicadoEm: c.publicadoEm,
    midiaUrls: c.reposts[0]?.midiaUrls ?? [],
  }))

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-5">
        <div className="app-container flex items-center gap-3">
          <Megaphone className="h-5 w-5 text-[rgb(var(--foreground-muted))]" />
          <div>
            <h1 className="text-xl font-bold text-[rgb(var(--foreground))]">Comunicados oficiais</h1>
            <p className="text-sm text-[rgb(var(--foreground-muted))]">
              Avisos institucionais publicados para todos os associados
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto py-6">
        <div className="app-container space-y-6">
          <Suspense
            fallback={
              <div className="h-24 animate-pulse rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]" />
            }
          >
            <ComunicadoComposerAdmin />
          </Suspense>
          <MotionReveal index={1}>
            <ComunicadosManager
              comunicados={comunicados}
              currentUser={{
                id: session.user.id,
                nome: session.user.name ?? null,
                avatarUrl: typeof session.user.image === 'string' ? session.user.image : null,
              }}
              tenantId={tenant.id}
              tenantNome={tenant.nome}
            />
          </MotionReveal>
        </div>
      </div>
    </div>
  )
}
