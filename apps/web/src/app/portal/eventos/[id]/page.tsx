import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { getTenantFromHost, getUserPermissionsInTenant } from '@/lib/tenant'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { RsvpButtons } from './rsvp-buttons'
import { criarSalaDeEvento } from '@/app/portal/comunidade/salas/actions'
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Clock,
  UserCheck,
  AlertCircle,
} from 'lucide-react'
import type { Metadata } from 'next'
import { PERMISSIONS, calculateEffectivePermissions, hasPermission } from '@torcida/types'
import {
  EventoConfirmadosGrid,
  EventoDetailReveal,
} from '@/components/portal/evento-detail-motion'

export const metadata: Metadata = { title: 'Evento' }

function formatarDataCompleta(data: Date) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeStyle: 'short' }).format(
    new Date(data),
  )
}

export default async function EventoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])

  const evento = await db.evento.findUnique({
    where: { id },
    include: {
      rsvps: {
        include: { user: { select: { id: true, nome: true, avatarUrl: true } } },
        where: { status: 'CONFIRMADO' },
        orderBy: { id: 'asc' },
        take: 50,
      },
      _count: { select: { rsvps: { where: { status: 'CONFIRMADO' } } } },
    },
  })

  if (!evento || (tenant && evento.tenantId !== tenant.id)) notFound()

  const meuRsvp = session?.user?.id
    ? await db.eventoRsvp.findUnique({
        where: { eventoId_userId: { eventoId: id, userId: session.user.id } },
        select: { status: true },
      })
    : null
  let podeCriarSala = false
  if (session?.user?.id && tenant) {
    const { rolePermissions, overrides } = await getUserPermissionsInTenant(session.user.id, tenant.id)
    const effective = calculateEffectivePermissions(rolePermissions, overrides)
    podeCriarSala = hasPermission(effective, PERMISSIONS.MEETINGS_HOST)
  }

  const passado = new Date(evento.data) < new Date()

  const confirmados = evento.rsvps.map((r: (typeof evento.rsvps)[number]) => ({
    id: r.id,
    nome: r.user.nome ?? 'Membro',
    avatarUrl: r.user.avatarUrl,
  }))

  return (
    <div className="space-y-6">
      <EventoDetailReveal index={0}>
        <div>
          <Link
            href="/portal/eventos"
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
          >
            <ArrowLeft className="h-4 w-4" />
            Todos os eventos
          </Link>

          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">{evento.titulo}</h1>
            {passado && (
              <span className="rounded-full bg-[rgb(var(--background-subtle))] px-3 py-0.5 text-xs font-medium text-[rgb(var(--foreground-muted))]">
                Encerrado
              </span>
            )}
          </div>
        </div>
      </EventoDetailReveal>

      <EventoDetailReveal index={1}>
        <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6 shadow-sm">
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-3 text-[rgb(var(--foreground))]">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[rgb(var(--background-subtle))]">
                <Calendar className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
              </div>
              <span>{formatarDataCompleta(new Date(evento.data))}</span>
            </div>

            {evento.local && (
              <div className="flex items-center gap-3 text-[rgb(var(--foreground))]">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[rgb(var(--background-subtle))]">
                  <MapPin className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
                </div>
                <span>{evento.local}</span>
              </div>
            )}

            <div className="flex items-center gap-3 text-[rgb(var(--foreground))]">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[rgb(var(--background-subtle))]">
                <UserCheck className="h-4 w-4 text-emerald-500" />
              </div>
              <span>
                <strong>{evento._count.rsvps}</strong> confirmado
                {evento._count.rsvps !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {evento.descricao && (
            <div className="mt-5 border-t border-[rgb(var(--border))] pt-5">
              <p className="whitespace-pre-wrap text-sm text-[rgb(var(--foreground))]">
                {evento.descricao}
              </p>
            </div>
          )}
        </div>
      </EventoDetailReveal>

      {!passado && session?.user?.id && (
        <EventoDetailReveal index={2}>
          <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6">
            <h2 className="mb-4 flex items-center gap-2 font-semibold text-[rgb(var(--foreground))]">
              <Clock className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
              Você vai?
            </h2>
            <RsvpButtons eventoId={id} statusAtual={meuRsvp?.status ?? null} />

            {podeCriarSala && (
              <form action={criarSalaDeEvento} className="mt-4">
                <input type="hidden" name="titulo" value={`Sala: ${evento.titulo}`} />
                <input type="hidden" name="eventoId" value={evento.id} />
                <button className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-4 py-2 text-sm font-semibold text-[rgb(var(--foreground))] hover:bg-[rgb(var(--surface-raised))]">
                  Criar sala de vídeo deste evento
                </button>
              </form>
            )}
          </div>
        </EventoDetailReveal>
      )}

      {passado && (
        <EventoDetailReveal index={2}>
          <div className="flex items-start gap-3 rounded-xl bg-[rgb(var(--background-subtle))] p-4">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))]" />
            <p className="text-sm text-[rgb(var(--foreground-muted))]">
              Este evento já foi realizado. Esperamos que tenha sido incrível!
            </p>
          </div>
        </EventoDetailReveal>
      )}

      {confirmados.length > 0 && (
        <EventoDetailReveal index={3}>
          <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6">
            <h2 className="mb-4 flex items-center gap-2 font-semibold text-[rgb(var(--foreground))]">
              <UserCheck className="h-4 w-4 text-emerald-500" />
              Confirmados ({evento._count.rsvps})
            </h2>
            <EventoConfirmadosGrid confirmados={confirmados} />
          </div>
        </EventoDetailReveal>
      )}
    </div>
  )
}
