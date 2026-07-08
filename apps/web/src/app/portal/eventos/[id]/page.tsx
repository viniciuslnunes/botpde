import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { RsvpButtons } from './rsvp-buttons'
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Clock,
  UserCheck,
  UserX,
  AlertCircle,
} from 'lucide-react'
import type { Metadata } from 'next'

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
        // Campos reais do model User são `nome`/`avatarUrl` (não name/image).
        // O select errado quebrava a página inteira em runtime e o tsc não
        // acusava — a inferência do Prisma degrada para any (ARCHITECTURE §5.2).
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

  const passado = new Date(evento.data) < new Date()

  return (
    <div className="space-y-6">
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

      {/* Detalhes */}
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

      {/* RSVP */}
      {!passado && session?.user?.id && (
        <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6">
          <h2 className="mb-4 flex items-center gap-2 font-semibold text-[rgb(var(--foreground))]">
            <Clock className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
            Você vai?
          </h2>
          <RsvpButtons eventoId={id} statusAtual={meuRsvp?.status ?? null} />
        </div>
      )}

      {passado && (
        <div className="flex items-start gap-3 rounded-xl bg-[rgb(var(--background-subtle))] p-4">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))]" />
          <p className="text-sm text-[rgb(var(--foreground-muted))]">
            Este evento já foi realizado. Esperamos que tenha sido incrível!
          </p>
        </div>
      )}

      {/* Lista de confirmados */}
      {evento.rsvps.length > 0 && (
        <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6">
          <h2 className="mb-4 flex items-center gap-2 font-semibold text-[rgb(var(--foreground))]">
            <UserCheck className="h-4 w-4 text-emerald-500" />
            Confirmados ({evento._count.rsvps})
          </h2>
          <div className="flex flex-wrap gap-3">
            {evento.rsvps.map((r: (typeof evento.rsvps)[number]) => (
              <div key={r.id} className="flex items-center gap-2 text-sm text-[rgb(var(--foreground))]">
                {r.user.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.user.avatarUrl}
                    alt={r.user.nome ?? ''}
                    className="h-7 w-7 rounded-full ring-1 ring-[rgb(var(--border))]"
                  />
                ) : (
                  <div className="h-7 w-7 rounded-full bg-[rgb(var(--border))]" />
                )}
                <span className="text-xs">{r.user.nome ?? 'Membro'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
