import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { redirect } from 'next/navigation'
import { CriarEventoForm, ExcluirEventoButton } from '@/components/admin/evento-forms'
import Link from 'next/link'
import {
  Calendar,
  MapPin,
  Users,
  Clock,
  Plus,
  ChevronRight,
  CalendarX,
} from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Eventos — Admin' }

function formatarData(data: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(data))
}

export default async function AdminEventosPage() {
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

  function EventoCard({ evento, passado = false }: { evento: Evento; passado?: boolean }) {
    return (
      <div
        className={[
          'rounded-xl border p-4 transition-all',
          passado
            ? 'border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] opacity-70'
            : 'border-[rgb(var(--border))] bg-[rgb(var(--surface))] hover:shadow-sm',
        ].join(' ')}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-semibold text-[rgb(var(--foreground))]">{evento.titulo}</h3>
            {evento.descricao && (
              <p className="mt-0.5 line-clamp-2 text-xs text-[rgb(var(--foreground-muted))]">
                {evento.descricao}
              </p>
            )}

            <div className="mt-2 flex flex-wrap gap-3 text-xs text-[rgb(var(--foreground-muted))]">
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {formatarData(evento.data)}
              </span>
              {evento.local && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {evento.local}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {evento._count.rsvps} confirmado{evento._count.rsvps !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Link
              href={`/admin/eventos/${evento.id}`}
              className="flex items-center gap-1 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
            >
              Editar
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
            <ExcluirEventoButton eventoId={evento.id} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app-container space-y-8 py-8">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Eventos</h1>
          <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
            Gerencie partidas, caravanas e eventos da torcida
          </p>
        </div>
      </div>

      {/* Formulário de criação */}
      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6 shadow-sm">
        <h2 className="mb-5 flex items-center gap-2 font-semibold text-[rgb(var(--foreground))]">
          <Plus className="h-4 w-4" />
          Criar novo evento
        </h2>
        <CriarEventoForm />
      </div>

      {/* Próximos eventos */}
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          <Calendar className="h-4 w-4" />
          Próximos ({proximos.length})
        </h2>
        {proximos.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[rgb(var(--border))] py-10 text-center">
            <CalendarX className="mb-2 h-8 w-8 text-[rgb(var(--foreground-muted))]" />
            <p className="text-sm text-[rgb(var(--foreground-muted))]">Nenhum evento agendado</p>
          </div>
        ) : (
          <div className="space-y-3">
            {proximos.map((e: Evento) => (
              <EventoCard key={e.id} evento={e} />
            ))}
          </div>
        )}
      </div>

      {/* Eventos passados */}
      {passados.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            Histórico (últimos {passados.length})
          </h2>
          <div className="space-y-3">
            {passados.map((e: Evento) => (
              <EventoCard key={e.id} evento={e} passado />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
