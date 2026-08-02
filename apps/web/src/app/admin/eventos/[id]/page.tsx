import { db } from '@torcida/db'
import { assertAnyPermission } from '@/lib/authz'
import { hasPermission, PERMISSIONS, TIPO_EVENTO_LABEL } from '@torcida/types'
import { redirect, notFound } from 'next/navigation'
import { EditarEventoForm } from '@/components/admin/evento-forms'
import { Gauge, PencilLine, UserCheck } from 'lucide-react'
import { AdminDetailHeader, AdminTabs, adminTabIds } from '@/components/admin/ui'
import type { Metadata } from 'next'
import { EventoTipoBadge } from '@/components/eventos/evento-tipo-badge'
import { ListaEmbarque, type EmbarqueRow } from '@/components/eventos/lista-embarque'
import { EventoAcoesRapidas } from '@/components/eventos/evento-acoes-rapidas'
import { EventoMapaLinks } from '@/components/eventos/evento-mapa-links'
import { EventoPartidaCard } from '@/components/eventos/evento-partida-card'
import { capacidadeEfetiva } from '@/lib/eventos-capacidade'
import { getAfiliacaoIdDoTenant, listPartidasParaEvento } from '@/lib/partidas'

export const metadata: Metadata = { title: 'Agenda — Evento' }

const ICONE_TAB = 'h-4 w-4 shrink-0'

const ABAS = ['cockpit', 'presenca', 'editar'] as const
type AbaEvento = (typeof ABAS)[number]

function parseAba(valor: string | undefined): AbaEvento {
  return ABAS.includes(valor as AbaEvento) ? (valor as AbaEvento) : 'cockpit'
}

export default async function AdminEventoDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { id } = await params
  const aba = parseAba((await searchParams).tab)

  // Sessão e tenant vêm do próprio gate (tenant ativo), não do host.
  let session: Awaited<ReturnType<typeof assertAnyPermission>>['session']
  let tenant: Awaited<ReturnType<typeof assertAnyPermission>>['tenant']
  let podeGerir = false
  try {
    const authz = await assertAnyPermission([
      PERMISSIONS.EVENTS_VIEW,
      PERMISSIONS.EVENTS_MANAGE,
      PERMISSIONS.EVENTS_CREATE,
    ])
    session = authz.session
    tenant = authz.tenant
    podeGerir =
      Boolean(authz.isSuperAdmin) ||
      hasPermission(authz.permissoesEfetivas ?? [], PERMISSIONS.EVENTS_MANAGE)
  } catch {
    redirect('/admin')
  }
  if (!session.user?.id) redirect('/portal')

  // View-only: cockpit/presença sem abas de mutação.
  const abaEfetiva = !podeGerir && aba === 'editar' ? 'cockpit' : aba

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
    lat: number | null
    lng: number | null
    serieId: string | null
    partidaId: string | null
    valorVaga: { toNumber(): number } | number | null
    sede: { capacidade: number | null; nome: string } | null
    partida: {
      adversario: string
      competicao: string | null
      dataHora: Date
      local: string | null
      mando: 'CASA' | 'FORA'
      status: string
      placarCasa: number | null
      placarFora: number | null
    } | null
    rsvps: RsvpRow[]
    _count: { rsvps: number; cobrancas: number }
  }

  const [evento, sedes, partidas, afiliacaoId]: [
    EventoDetail | null,
    SedeLite[],
    Awaited<ReturnType<typeof listPartidasParaEvento>>,
    string | null,
  ] = await Promise.all([
    db.evento.findUnique({
      where: { id },
      include: {
        sede: { select: { capacidade: true, nome: true } },
        partida: {
          select: {
            adversario: true,
            competicao: true,
            dataHora: true,
            local: true,
            mando: true,
            status: true,
            placarCasa: true,
            placarFora: true,
          },
        },
        rsvps: {
          include: {
            user: { select: { id: true, nome: true, avatarUrl: true, email: true } },
          },
          orderBy: [{ status: 'asc' }, { criadoEm: 'asc' }],
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
    listPartidasParaEvento(tenant.id),
    getAfiliacaoIdDoTenant(tenant.id),
  ])

  if (!evento || evento.tenantId !== tenant.id) notFound()

  const cap = capacidadeEfetiva({
    capacidade: evento.capacidade,
    sede: evento.sede,
  })
  const embarcados = evento.rsvps.filter((r: RsvpRow) => r.checkedInAt).length
  const espera = evento.rsvps.filter((r: RsvpRow) => r.status === 'LISTA_ESPERA').length
  const labelCheckin = evento.tipo === 'ENSAIO' ? 'Presença' : 'Embarque'

  // `valorVaga` é um Prisma Decimal; ao cruzar a fronteira RSC ele perde o
  // método `.toNumber()` (vira objeto interno {d,e,s}). Serializa aqui, no
  // servidor, para o form cliente receber um number puro.
  const eventoForm = {
    ...evento,
    valorVaga:
      evento.valorVaga == null
        ? null
        : typeof evento.valorVaga === 'number'
          ? evento.valorVaga
          : evento.valorVaga.toNumber(),
  }

  const itens: EmbarqueRow[] = evento.rsvps.map((r: RsvpRow) => ({
    id: r.id,
    userId: r.user.id,
    nome: r.user.nome?.trim() || r.user.email || 'Membro',
    email: r.user.email ?? '',
    status: r.status,
    checkedInAt: r.checkedInAt ? r.checkedInAt.toISOString() : null,
  }))

  const { tabId, panelId } = adminTabIds('tab', abaEfetiva)

  return (
    <div className="app-container space-y-6 py-8">
      <AdminDetailHeader
        title={evento.titulo}
        backHref="/admin/eventos"
        backLabel="Agenda"
        description={TIPO_EVENTO_LABEL[evento.tipo]}
        badges={<EventoTipoBadge tipo={evento.tipo} />}
      />

      <AdminTabs
        tabs={[
          { id: 'cockpit', label: 'Cockpit', icon: <Gauge className={ICONE_TAB} /> },
          {
            id: 'presenca',
            label: labelCheckin,
            icon: <UserCheck className={ICONE_TAB} />,
            count: evento._count.rsvps,
          },
          ...(podeGerir
            ? [{ id: 'editar' as const, label: 'Editar', icon: <PencilLine className={ICONE_TAB} /> }]
            : []),
        ]}
        basePath={`/admin/eventos/${evento.id}`}
        activeId={abaEfetiva}
      />

      <div id={panelId} role="tabpanel" aria-labelledby={tabId} className="space-y-6">
      {abaEfetiva === 'cockpit' && (
      <>
      <div className="space-y-3">
        <EventoAcoesRapidas
          eventoId={evento.id}
          titulo={evento.titulo}
          descricao={evento.descricao}
          local={evento.local}
          dataIso={evento.data.toISOString()}
          podePublicarMural={podeGerir}
        />
        {(evento.lat != null && evento.lng != null) && (
          <EventoMapaLinks lat={evento.lat} lng={evento.lng} local={evento.local} />
        )}
      </div>

      {evento.partida && <EventoPartidaCard partida={evento.partida} />}

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
      </>
      )}

      {abaEfetiva === 'presenca' && (
        <ListaEmbarque
          eventoId={evento.id}
          itens={itens}
          podeGerir={podeGerir}
          labelCheckin={labelCheckin}
          tituloEvento={evento.titulo}
        />
      )}

      {abaEfetiva === 'editar' && podeGerir && (
        <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6 shadow-sm">
          <EditarEventoForm
            evento={eventoForm}
            sedes={sedes}
            partidas={partidas}
            temAfiliacao={Boolean(afiliacaoId)}
            redirectTo={`/admin/eventos/${evento.id}?tab=editar`}
          />
        </div>
      )}
      </div>
    </div>
  )
}
