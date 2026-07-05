import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { getEscopoEventosVisiveis } from '@/lib/eventos'
import Link from 'next/link'
import { Calendar, MapPin, Clock, Users, CalendarX, ChevronRight } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Eventos' }

function formatarData(data: Date) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeStyle: 'short' }).format(
    new Date(data),
  )
}

function diasParaEvento(data: Date) {
  const diff = Math.ceil((new Date(data).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  if (diff === 0) return 'Hoje'
  if (diff === 1) return 'Amanhã'
  return `Em ${diff} dias`
}

interface EventoListItem {
  id: string
  titulo: string
  data: Date
  local: string | null
  tenantId: string
  tenant: { nome: string }
  _count: { rsvps: number }
}

export default async function EventosPage() {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  const agora = new Date()

  const escopoVisivel = tenant
    ? await getEscopoEventosVisiveis(tenant.id, session?.user?.id)
    : null

  const [proximos, passados, meuRsvp] = await Promise.all([
    tenant && escopoVisivel
      ? (db.evento.findMany({
          where: { ...escopoVisivel, data: { gte: agora } },
          include: {
            _count: { select: { rsvps: { where: { status: 'CONFIRMADO' } } } },
            tenant: { select: { nome: true } },
          },
          orderBy: { data: 'asc' },
        }) as Promise<EventoListItem[]>)
      : ([] as EventoListItem[]),
    tenant && escopoVisivel
      ? (db.evento.findMany({
          where: { ...escopoVisivel, data: { lt: agora } },
          include: {
            _count: { select: { rsvps: true } },
            tenant: { select: { nome: true } },
          },
          orderBy: { data: 'desc' },
          take: 5,
        }) as Promise<EventoListItem[]>)
      : ([] as EventoListItem[]),
    session?.user?.id && tenant
      ? db.eventoRsvp.findMany({
          where: { userId: session.user.id, evento: { tenantId: tenant.id } },
          select: { eventoId: true, status: true },
        })
      : [],
  ])

  const rsvpMap = new Map(
    (meuRsvp as { eventoId: string; status: string }[]).map((r) => [r.eventoId, r.status]),
  )

  function badgeRsvp(eventoId: string) {
    const s = rsvpMap.get(eventoId)
    if (s === 'CONFIRMADO')
      return (
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
          Confirmado ✓
        </span>
      )
    if (s === 'RECUSADO')
      return (
        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900 dark:text-red-300">
          Recusado
        </span>
      )
    return null
  }

  function EventoCard({ evento, passado = false }: { evento: EventoListItem; passado?: boolean }) {
    const dias = !passado ? diasParaEvento(new Date(evento.data)) : null
    const rsvpBadge = !passado ? badgeRsvp(evento.id) : null
    const herdado = tenant ? evento.tenantId !== tenant.id : false

    return (
      <Link
        href={`/portal/eventos/${evento.id}`}
        className={[
          'group flex flex-col gap-3 rounded-xl border p-5 transition-all hover:shadow-md',
          passado
            ? 'border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] opacity-70'
            : 'border-[rgb(var(--border))] bg-[rgb(var(--surface))]',
        ].join(' ')}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-[rgb(var(--foreground))]">{evento.titulo}</h3>
              {dias && (
                <span
                  className={[
                    'rounded-full px-2 py-0.5 text-xs font-semibold',
                    dias === 'Hoje' || dias === 'Amanhã'
                      ? 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300'
                      : 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]',
                  ].join(' ')}
                >
                  {dias}
                </span>
              )}
              {herdado && (
                <span className="rounded-full bg-[rgb(var(--primary)_/_0.15)] px-2 py-0.5 text-xs font-medium text-[rgb(var(--primary))]">
                  {evento.tenant.nome}
                </span>
              )}
              {rsvpBadge}
            </div>

            <div className="mt-2 flex flex-wrap gap-3 text-xs text-[rgb(var(--foreground-muted))]">
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {formatarData(new Date(evento.data))}
              </span>
              {evento.local && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {evento.local}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {evento._count.rsvps} {passado ? 'presença(s)' : 'confirmado(s)'}
              </span>
            </div>
          </div>

          <ChevronRight className="h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))] transition-transform group-hover:translate-x-0.5" />
        </div>
      </Link>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Eventos</h1>
        <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
          Partidas, caravanas e encontros da torcida
        </p>
      </div>

      {/* Próximos */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          Próximos eventos
        </h2>
        {proximos.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[rgb(var(--border))] py-12 text-center">
            <CalendarX className="mb-2 h-8 w-8 text-[rgb(var(--foreground-muted))]" />
            <p className="text-sm font-medium text-[rgb(var(--foreground-muted))]">
              Nenhum evento agendado
            </p>
            <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
              Fique de olho — novidades em breve!
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {proximos.map((e) => (
              <EventoCard key={e.id} evento={e} />
            ))}
          </div>
        )}
      </div>

      {/* Histórico */}
      {passados.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            Histórico
          </h2>
          <div className="space-y-3">
            {passados.map((e) => (
              <EventoCard key={e.id} evento={e} passado />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
