import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { assertAnyPermission } from '@/lib/authz'
import { PERMISSIONS } from '@torcida/types'
import { redirect } from 'next/navigation'
import { CriarEventoForm } from '@/components/admin/evento-forms'
import { AdminEventosList, type AdminEventoItem } from './admin-eventos-list'
import { Calendar, Plus } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Eventos — Admin' }

function formatarData(data: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(data))
}

function serializarEvento(
  evento: {
    id: string
    titulo: string
    descricao: string | null
    data: Date
    local: string | null
    _count: { rsvps: number }
  },
  passado: boolean,
): AdminEventoItem {
  return {
    id: evento.id,
    titulo: evento.titulo,
    descricao: evento.descricao,
    dataLabel: formatarData(evento.data),
    local: evento.local,
    confirmados: evento._count.rsvps,
    passado,
  }
}

export default async function AdminEventosPage() {
  try {
    await assertAnyPermission([PERMISSIONS.EVENTS_CREATE, PERMISSIONS.EVENTS_MANAGE])
  } catch {
    redirect('/admin')
  }

  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])

  if (!session?.user?.id || !tenant) redirect('/portal')

  const agora = new Date()

  const [proximos, passados] = await Promise.all([
    db.evento.findMany({
      where: { tenantId: tenant.id, data: { gte: agora } },
      include: { _count: { select: { rsvps: { where: { status: 'CONFIRMADO' } } } } },
      orderBy: { data: 'asc' },
    }),
    db.evento.findMany({
      where: { tenantId: tenant.id, data: { lt: agora } },
      include: { _count: { select: { rsvps: { where: { status: 'CONFIRMADO' } } } } },
      orderBy: { data: 'desc' },
      take: 10,
    }),
  ])

  type Evento = (typeof proximos)[number]

  return (
    <div className="app-container space-y-8 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Eventos</h1>
          <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
            Gerencie partidas, caravanas e eventos da torcida
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6 shadow-sm">
        <h2 className="mb-5 flex items-center gap-2 font-semibold text-[rgb(var(--foreground))]">
          <Plus className="h-4 w-4" />
          Criar novo evento
        </h2>
        <CriarEventoForm />
      </div>

      <div>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          <Calendar className="h-4 w-4" />
          Próximos ({proximos.length})
        </h2>
        <AdminEventosList eventos={proximos.map((e: Evento) => serializarEvento(e, false))} />
      </div>

      {passados.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            Histórico (últimos {passados.length})
          </h2>
          <AdminEventosList eventos={passados.map((e: Evento) => serializarEvento(e, true))} />
        </div>
      )}
    </div>
  )
}
