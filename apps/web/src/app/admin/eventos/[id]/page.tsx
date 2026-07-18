import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { assertPermission } from '@/lib/authz'
import { PERMISSIONS, TIPO_EVENTO_LABEL } from '@torcida/types'
import { redirect, notFound } from 'next/navigation'
import { EditarEventoForm } from '@/components/admin/evento-forms'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'
import { EventoTipoBadge } from '@/components/eventos/evento-tipo-badge'
import { ListaEmbarque, type EmbarqueRow } from '@/components/eventos/lista-embarque'
import { EventoAcoesRapidas } from '@/components/eventos/evento-acoes-rapidas'
import { capacidadeEfetiva } from '@/lib/eventos-capacidade'

export const metadata: Metadata = { title: 'Agenda — Evento' }

export default async function AdminEventoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  try {
    await assertPermission(PERMISSIONS.EVENTS_MANAGE)
  } catch {
    redirect('/admin')
  }

  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id || !tenant) redirect('/portal')

  type SedeLite = { id: string; nome: string; capacidade: number | null }
  type RsvpRow = {
    id: string
    status: 'CONFIRMADO' | 'RECUSADO' | 'LISTA_ESPERA'
    checkedInAt: Date | null
    user: { id: string; nome: string | null; avatarUrl: string | null; email: string | null }
  }
  type EventoDetail = {
    id: string
    tenantId: string
    titulo: string
    descricao: string | null
    fotoUrl: string | null
    data: Date
    local: string | null
    tipo: import('@torcida/db').TipoEvento
    sedeId: string | null
    capacidade: number | null
    valorVaga: { toNumber(): number } | number | null
    sede: { capacidade: number | null; nome: string } | null
    rsvps: RsvpRow[]
    _count: { rsvps: number; cobrancas: number }
  }

  const [evento, sedes]: [EventoDetail | null, SedeLite[]] = await Promise.all([
    db.evento.findUnique({
      where: { id },
      include: {
        sede: { select: { capacidade: true, nome: true } },
        rsvps: {
          include: {
            user: { select: { id: true, nome: true, avatarUrl: true, email: true } },
          },
          orderBy: { status: 'asc' },
        },
        _count: {
          select: {
            rsvps: { where: { status: 'CONFIRMADO' } },
            cobrancas: { where: { status: 'PAGA' } },
          },
        },
      },
    }) as Promise<EventoDetail | null>,
    db.sede.findMany({
      where: { tenantId: tenant.id, ativa: true },
      select: { id: true, nome: true, capacidade: true },
      orderBy: { nome: 'asc' },
    }) as Promise<SedeLite[]>,
  ])

  if (!evento || evento.tenantId !== tenant.id) notFound()

  const cap = capacidadeEfetiva({
    capacidade: evento.capacidade,
    sede: evento.sede,
  })
  const embarcados = evento.rsvps.filter((r: RsvpRow) => r.checkedInAt).length
  const espera = evento.rsvps.filter((r: RsvpRow) => r.status === 'LISTA_ESPERA').length
  const labelCheckin = evento.tipo === 'ENSAIO' ? 'Presença' : 'Embarque'

  const itens: EmbarqueRow[] = evento.rsvps.map((r: RsvpRow) => ({
    id: r.id,
    userId: r.user.id,
    nome: r.user.nome?.trim() || r.user.email || 'Membro',
    email: r.user.email ?? '',
    status: r.status,
    checkedInAt: r.checkedInAt ? r.checkedInAt.toISOString() : null,
  }))

  return (
    <div className="app-container space-y-6 py-8">
      <div>
        <Link
          href="/admin/eventos"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
        >
          <ArrowLeft className="h-4 w-4" />
          Agenda
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <EventoTipoBadge tipo={evento.tipo} />
          <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">{evento.titulo}</h1>
        </div>
        <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
          {TIPO_EVENTO_LABEL[evento.tipo]} · cockpit operacional
        </p>
        <div className="mt-3">
          <EventoAcoesRapidas
            eventoId={evento.id}
            titulo={evento.titulo}
            descricao={evento.descricao}
            local={evento.local}
            dataIso={evento.data.toISOString()}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3">
          <p className="text-[11px] font-medium uppercase text-[rgb(var(--foreground-muted))]">
            Confirmados
          </p>
          <p className="mt-1 text-lg font-semibold tabular-nums">
            {cap != null ? `${evento._count.rsvps}/${cap}` : evento._count.rsvps}
          </p>
        </div>
        <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3">
          <p className="text-[11px] font-medium uppercase text-[rgb(var(--foreground-muted))]">
            {labelCheckin}
          </p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{embarcados}</p>
        </div>
        <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3">
          <p className="text-[11px] font-medium uppercase text-[rgb(var(--foreground-muted))]">
            Lista de espera
          </p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{espera}</p>
        </div>
        {evento.tipo === 'CARAVANA' && (
          <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3">
            <p className="text-[11px] font-medium uppercase text-[rgb(var(--foreground-muted))]">
              Vagas pagas
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{evento._count.cobrancas}</p>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-[rgb(var(--foreground))]">Editar</h2>
        <EditarEventoForm
          evento={evento}
          sedes={sedes}
          redirectTo={`/admin/eventos/${evento.id}`}
        />
      </div>

      <ListaEmbarque
        eventoId={evento.id}
        itens={itens}
        podeGerir
        labelCheckin={labelCheckin}
        tituloEvento={evento.titulo}
      />
    </div>
  )
}
