import { Suspense } from 'react'
import { db } from '@torcida/db'
import { contextoAdmin } from '@/lib/admin-modulos'
import { redirect } from 'next/navigation'
import { PERMISSIONS, hasPermission } from '@torcida/types'
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
  const { session, tenant, permissoes: effective } = await contextoAdmin()
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
    <div className="space-y-6">
      <p className="text-sm text-[rgb(var(--foreground-muted))]">
        Avisos institucionais publicados para todos os associados.
      </p>

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
  )
}
