import { db } from '@torcida/db'
import { assertAnyPermission } from '@/lib/authz'
import { hasPermission, PERMISSIONS, TIPO_EVENTO_LABEL, resolverStatusVaga, temValorVaga } from '@torcida/types'
import { redirect, notFound } from 'next/navigation'
import { EditarEventoForm } from '@/components/admin/evento-forms'
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  Clock,
  Gauge,
  MapPin,
  PencilLine,
  ShieldCheck,
  UserCheck,
  Users,
} from 'lucide-react'
import {
  AdminDetailHeader,
  AdminTabs,
  adminTabIds,
  KpiGrid,
  StatCard,
} from '@/components/admin/ui'
import type { Metadata } from 'next'
import { EventoTipoBadge } from '@/components/eventos/evento-tipo-badge'
import { ListaEmbarque, type EmbarqueRow } from '@/components/eventos/lista-embarque'
import { EventoAcoesRapidas } from '@/components/eventos/evento-acoes-rapidas'
import { EventoMapaLinks } from '@/components/eventos/evento-mapa-links'
import { EventoPartidaCard } from '@/components/eventos/evento-partida-card'
import { capacidadeEfetiva } from '@/lib/eventos-capacidade'
import { diasParaEvento } from '@/lib/eventos'
import { getAfiliacaoIdDoTenant, listPartidasParaEvento } from '@/lib/partidas'
import { carregarCobrancasVagaEvento, listarProjetosParaEvento } from '@/lib/eventos-tipo'

export const metadata: Metadata = { title: 'Agenda — Evento' }

const ICONE_TAB = 'h-4 w-4 shrink-0'
const ICONE_KPI = 'h-5 w-5'

const ABAS = ['cockpit', 'presenca', 'editar'] as const
type AbaEvento = (typeof ABAS)[number]

function parseAba(valor: string | undefined): AbaEvento {
  return ABAS.includes(valor as AbaEvento) ? (valor as AbaEvento) : 'cockpit'
}

function formatarDataCompleta(data: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(data))
}

function formatarValorVaga(valor: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)
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
    projetoId: string | null
    valorVaga: { toNumber(): number } | number | null
    checkInExigePagamento: boolean
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

  const [evento, sedes, partidas, afiliacaoId, projetos]: [
    EventoDetail | null,
    SedeLite[],
    Awaited<ReturnType<typeof listPartidasParaEvento>>,
    string | null,
    Awaited<ReturnType<typeof listarProjetosParaEvento>>,
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
    listarProjetosParaEvento(tenant.id),
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
  const valorVagaNum = eventoForm.valorVaga
  const caravanaPaga = evento.tipo === 'CARAVANA' && temValorVaga(valorVagaNum)
  const ocupacaoLotacao = caravanaPaga ? evento._count.cobrancas : evento._count.rsvps
  const passado = evento.data.getTime() < Date.now()
  const lotacaoPct =
    cap != null && cap > 0 ? Math.min(100, Math.round((ocupacaoLotacao / cap) * 100)) : null
  const lotacaoTone =
    lotacaoPct == null
      ? 'default'
      : lotacaoPct >= 100
        ? 'danger'
        : lotacaoPct >= 85
          ? 'warning'
          : 'default'

  const cobrancasPorUserId = caravanaPaga
    ? await carregarCobrancasVagaEvento(tenant.id, evento.id)
    : {}

  const itens: EmbarqueRow[] = evento.rsvps.map((r: RsvpRow) => {
    const statusVaga = resolverStatusVaga({
      valorVaga: valorVagaNum,
      cobrancaStatus: cobrancasPorUserId[r.user.id] ?? null,
      checkedInAt: r.checkedInAt,
    })
    return {
      id: r.id,
      userId: r.user.id,
      nome: r.user.nome?.trim() || r.user.email || 'Membro',
      email: r.user.email ?? '',
      status: r.status,
      checkedInAt: r.checkedInAt ? r.checkedInAt.toISOString() : null,
      pagamento: statusVaga.pagamento,
      labelPagamento: statusVaga.labelPagamento,
      alertaPagamento: statusVaga.alerta,
    }
  })

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
            {/* Ficha operacional — data/local/capa sem ir em Editar */}
            <section className="overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-sm">
              <div className="grid lg:grid-cols-12">
                <div className="relative aspect-[16/10] overflow-hidden bg-[rgb(var(--background-subtle))] lg:col-span-4 lg:aspect-auto lg:min-h-[220px]">
                  {evento.fotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- capas externas
                    <img
                      src={evento.fotoUrl}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[rgb(var(--color-primary)_/_0.2)] to-[rgb(var(--background-subtle))]">
                      <CalendarDays className="h-10 w-10 text-[rgb(var(--color-primary-fg)_/_0.7)]" aria-hidden />
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-3.5 p-4 sm:p-5 lg:col-span-8">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <EventoTipoBadge tipo={evento.tipo} />
                    {passado ? (
                      <span className="rounded-md bg-[rgb(var(--background-subtle))] px-2 py-0.5 text-[11px] font-semibold text-[rgb(var(--foreground-muted))]">
                        Encerrado
                      </span>
                    ) : (
                      <span className="rounded-md bg-[rgb(var(--color-primary)_/_0.12)] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[rgb(var(--color-primary-fg))] ring-1 ring-inset ring-[rgb(var(--color-primary)_/_0.28)]">
                        {diasParaEvento(evento.data)}
                      </span>
                    )}
                    {evento.serieId ? (
                      <span className="rounded-md bg-[rgb(var(--background-subtle))] px-2 py-0.5 text-[11px] font-semibold uppercase text-[rgb(var(--foreground-muted))]">
                        Série
                      </span>
                    ) : null}
                    {caravanaPaga && valorVagaNum != null ? (
                      <span className="rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[rgb(var(--foreground))]">
                        {formatarValorVaga(valorVagaNum)}
                      </span>
                    ) : null}
                    {caravanaPaga && evento.checkInExigePagamento ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/12 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-500/30 dark:text-amber-300">
                        <ShieldCheck className="h-3 w-3" aria-hidden />
                        Check-in exige pagamento
                      </span>
                    ) : null}
                    {lotacaoPct != null && lotacaoPct >= 85 ? (
                      <span
                        className={[
                          'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold',
                          lotacaoPct >= 100
                            ? 'bg-rose-500/12 text-rose-700 ring-1 ring-inset ring-rose-500/30 dark:text-rose-300'
                            : 'bg-amber-500/12 text-amber-800 ring-1 ring-inset ring-amber-500/30 dark:text-amber-300',
                        ].join(' ')}
                      >
                        <AlertTriangle className="h-3 w-3" aria-hidden />
                        {lotacaoPct >= 100 ? 'Lotação esgotada' : 'Quase lotado'}
                      </span>
                    ) : null}
                  </div>

                  <ul className="space-y-2 text-sm text-[rgb(var(--foreground-muted))]">
                    <li className="flex items-start gap-2">
                      <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--color-primary-fg))]" aria-hidden />
                      <span className="min-w-0 font-medium capitalize leading-snug text-[rgb(var(--foreground))]">
                        {formatarDataCompleta(evento.data)}
                      </span>
                    </li>
                    {evento.local ? (
                      <li className="flex items-start gap-2">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                        <span className="min-w-0 leading-snug">{evento.local}</span>
                      </li>
                    ) : null}
                    {evento.sede?.nome ? (
                      <li className="flex items-start gap-2">
                        <Building2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                        <span className="min-w-0 leading-snug">{evento.sede.nome}</span>
                      </li>
                    ) : null}
                  </ul>

                  {evento.descricao ? (
                    <p className="line-clamp-3 text-sm leading-relaxed text-[rgb(var(--foreground-muted))]">
                      {evento.descricao}
                    </p>
                  ) : null}
                </div>
              </div>
            </section>

            <div className="space-y-3">
              <EventoAcoesRapidas
                eventoId={evento.id}
                titulo={evento.titulo}
                descricao={evento.descricao}
                local={evento.local}
                dataIso={evento.data.toISOString()}
                podePublicarMural={podeGerir}
              />
              {evento.lat != null && evento.lng != null ? (
                <EventoMapaLinks lat={evento.lat} lng={evento.lng} local={evento.local} />
              ) : null}
            </div>

            {evento.partida ? <EventoPartidaCard partida={evento.partida} /> : null}

            <KpiGrid>
              <StatCard
                label={caravanaPaga ? 'Lotação (pagas)' : 'Confirmados'}
                value={cap != null ? `${ocupacaoLotacao}/${cap}` : ocupacaoLotacao}
                icon={<Users className={ICONE_KPI} />}
                tone={lotacaoTone}
                badge={lotacaoPct != null ? `${lotacaoPct}%` : undefined}
                badgeTone={lotacaoTone === 'default' ? 'success' : lotacaoTone}
              />
              <StatCard
                label={labelCheckin}
                value={embarcados}
                icon={<UserCheck className={ICONE_KPI} />}
                tone={embarcados > 0 ? 'success' : 'default'}
              />
              <StatCard
                label="Lista de espera"
                value={espera}
                icon={<AlertTriangle className={ICONE_KPI} />}
                tone={espera > 0 ? 'warning' : 'default'}
              />
              {caravanaPaga ? (
                <StatCard
                  label="Confirmados (RSVP)"
                  value={evento._count.rsvps}
                  icon={<Users className={ICONE_KPI} />}
                />
              ) : null}
            </KpiGrid>
          </>
        )}

        {abaEfetiva === 'presenca' && (
          <ListaEmbarque
            eventoId={evento.id}
            itens={itens}
            podeGerir={podeGerir}
            labelCheckin={labelCheckin}
            tituloEvento={evento.titulo}
            mostrarPagamento={caravanaPaga}
          />
        )}

        {abaEfetiva === 'editar' && podeGerir && (
          <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6 shadow-sm">
            <EditarEventoForm
              evento={eventoForm}
              sedes={sedes}
              partidas={partidas}
              projetos={projetos}
              temAfiliacao={Boolean(afiliacaoId)}
              redirectTo={`/admin/eventos/${evento.id}?tab=editar`}
            />
          </div>
        )}
      </div>
    </div>
  )
}
