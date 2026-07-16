import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { assertPermission } from '@/lib/authz'
import { PERMISSIONS, TIPO_EVENTO_LABEL, TipoEventoSchema } from '@torcida/types'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CriarEventoForm } from '@/components/admin/evento-forms'
import { AdminEventosList, type AdminEventoItem } from './admin-eventos-list'
import { Calendar, Plus } from 'lucide-react'
import type { Metadata } from 'next'
import type { TipoEvento } from '@torcida/db'

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
    tipo: TipoEvento
    _count: { rsvps: number }
  },
  passado: boolean,
): AdminEventoItem {
  const tipoLabel = TIPO_EVENTO_LABEL[evento.tipo] ?? evento.tipo
  return {
    id: evento.id,
    titulo: evento.tipo === 'GERAL' ? evento.titulo : `${tipoLabel}: ${evento.titulo}`,
    descricao: evento.descricao,
    dataLabel: formatarData(evento.data),
    local: evento.local,
    confirmados: evento._count.rsvps,
    passado,
  }
}

type Props = { searchParams: Promise<{ tipo?: string }> }

export default async function AdminEventosPage({ searchParams }: Props) {
  try {
    await assertPermission(PERMISSIONS.EVENTS_MANAGE)
  } catch {
    redirect('/admin')
  }

  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id || !tenant) redirect('/portal')

  const sp = await searchParams
  const tipoParsed = TipoEventoSchema.safeParse(sp.tipo)
  const tipoFiltro = tipoParsed.success ? tipoParsed.data : undefined

  const agora = new Date()
  const baseWhere = {
    tenantId: tenant.id,
    ...(tipoFiltro ? { tipo: tipoFiltro } : {}),
  }

  const [proximos, passados] = await Promise.all([
    db.evento.findMany({
      where: { ...baseWhere, data: { gte: agora } },
      include: { _count: { select: { rsvps: { where: { status: 'CONFIRMADO' } } } } },
      orderBy: { data: 'asc' },
    }),
    db.evento.findMany({
      where: { ...baseWhere, data: { lt: agora } },
      include: { _count: { select: { rsvps: { where: { status: 'CONFIRMADO' } } } } },
      orderBy: { data: 'desc' },
      take: 10,
    }),
  ])

  type Evento = (typeof proximos)[number]
  const tituloFiltro = tipoFiltro ? TIPO_EVENTO_LABEL[tipoFiltro] : null

  return (
    <div className="app-container space-y-8 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">
            {tituloFiltro ? tituloFiltro : 'Eventos'}
          </h1>
          <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
            Gerencie partidas, caravanas e ensaios da torcida
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Link
            href="/admin/eventos"
            className={[
              'rounded-lg px-2.5 py-1.5 font-medium',
              !tipoFiltro
                ? 'bg-[rgb(var(--primary))] text-white'
                : 'border border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))]',
            ].join(' ')}
          >
            Todos
          </Link>
          {(['CARAVANA', 'ENSAIO', 'GERAL'] as const).map((t) => (
            <Link
              key={t}
              href={`/admin/eventos?tipo=${t}`}
              className={[
                'rounded-lg px-2.5 py-1.5 font-medium',
                tipoFiltro === t
                  ? 'bg-[rgb(var(--primary))] text-white'
                  : 'border border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))]',
              ].join(' ')}
            >
              {TIPO_EVENTO_LABEL[t]}
            </Link>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6 shadow-sm">
        <h2 className="mb-5 flex items-center gap-2 font-semibold text-[rgb(var(--foreground))]">
          <Plus className="h-4 w-4" />
          Criar novo
        </h2>
        <CriarEventoForm defaultTipo={tipoFiltro ?? 'GERAL'} />
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
