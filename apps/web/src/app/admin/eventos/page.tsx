import { Suspense } from 'react'
import { db } from '@torcida/db'
import { assertPermission } from '@/lib/authz'
import { PERMISSIONS, TIPO_EVENTO_LABEL, TipoEventoSchema } from '@torcida/types'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { AdminEventosList, type AdminEventoItem } from './admin-eventos-list'
import { NovoEventoButton } from '@/components/eventos/novo-evento-button'
import { AgendaCalendario, type AgendaCalItem } from '@/components/eventos/agenda-calendario'
import { AgendaBusca } from '@/components/eventos/agenda-busca'
import { ProximoEventoSpotlight } from '@/components/eventos/proximo-evento-spotlight'
import { BarChart3, Calendar, CalendarDays, CalendarRange, History, List } from 'lucide-react'
import type { Metadata } from 'next'
import type { TipoEvento } from '@torcida/db'
import { diasParaEvento } from '@/lib/eventos'
import { capacidadeEfetiva } from '@/lib/eventos-capacidade'
import { janelaCalendario, listSedesAtivasParaEvento } from '@/lib/eventos-query'
import { getAfiliacaoIdDoTenant, listPartidasParaEvento } from '@/lib/partidas'
import {
  listarPresencaPorEvento,
  resumirComparecimento,
  type EventoPresencaItem,
  type EventosComparecimentoResumo,
} from '@/lib/eventos-insights'
import { AdminTabs, adminTabIds, InsightSection, StatCard } from '@/components/admin/ui'
import type { AdminTabItem } from '@/components/admin/ui'
import { MiniBarChart } from '@/components/admin/charts'

export const metadata: Metadata = { title: 'Agenda — Admin' }

function formatarData(data: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(data))
}

type Props = {
  searchParams: Promise<{ tipo?: string; q?: string; vista?: string; data?: string }>
}

function formatarPct(valor: number | null): string {
  return valor == null ? '—' : `${Math.round(valor * 100)}%`
}

/** Etapas da Agenda: as três vistas do calendário + histórico + comparecimento. */
type VistaAgenda = 'lista' | 'semana' | 'mes' | 'historico' | 'comparecimento'

function parseVista(valor: string | undefined): VistaAgenda {
  switch (valor) {
    case 'semana':
    case 'mes':
    case 'historico':
    case 'comparecimento':
      return valor
    default:
      return 'lista'
  }
}

function EventosInsightsSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-5 w-44 rounded-lg bg-[rgb(var(--border)_/_0.45)]" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-28 rounded-2xl bg-[rgb(var(--border)_/_0.45)]" />
        ))}
      </div>
    </div>
  )
}

async function EventosInsights({ tenantId }: { tenantId: string }) {
  const [resumo, presencaPorEvento]: [EventosComparecimentoResumo, EventoPresencaItem[]] =
    await Promise.all([
      resumirComparecimento(tenantId, '90d'),
      listarPresencaPorEvento(tenantId, 8),
    ])

  if (resumo.eventosPassados === 0) return null

  return (
    <InsightSection
      title="Comparecimento (90 dias)"
      description="RSVP × check-in real dos eventos que já aconteceram."
    >
      <StatCard
        label={`Taxa de presença (${resumo.presentes}/${resumo.confirmados})`}
        value={formatarPct(resumo.taxaPresenca)}
        tone={
          resumo.taxaPresenca != null && resumo.taxaPresenca >= 0.7 ? 'success' : 'default'
        }
      />
      <StatCard
        label="No-show"
        value={resumo.noShow}
        tone={resumo.noShow > 0 ? 'warning' : 'default'}
      />
      <StatCard label="Ocupação média" value={formatarPct(resumo.ocupacaoMedia)} />

      {presencaPorEvento.length > 0 ? (
        <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 sm:col-span-2 sm:p-5 lg:col-span-3">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            Confirmados × presentes por evento
          </h3>
          <MiniBarChart
            data={presencaPorEvento.map((e) => ({
              rotulo: e.rotulo,
              valor: e.confirmados,
              valorSecundario: e.presentes,
              cor: 'rgb(var(--color-primary) / 0.75)',
            }))}
            corSecundaria="rgb(var(--color-success) / 0.75)"
            legenda={{ principal: 'Confirmados', secundaria: 'Presentes' }}
          />
        </div>
      ) : null}
    </InsightSection>
  )
}

export default async function AdminEventosPage({ searchParams }: Props) {
  // Sessão e tenant vêm do próprio gate (tenant ativo) — reabrir por host
  // traria a agenda de outra torcida.
  let session: Awaited<ReturnType<typeof assertPermission>>['session']
  let tenant: Awaited<ReturnType<typeof assertPermission>>['tenant']
  try {
    ;({ session, tenant } = await assertPermission(PERMISSIONS.EVENTS_MANAGE))
  } catch {
    redirect('/admin')
  }
  if (!session.user?.id) redirect('/portal')

  const sp = await searchParams
  const tipoParsed = TipoEventoSchema.safeParse(sp.tipo)
  const tipoFiltro = tipoParsed.success ? tipoParsed.data : undefined
  const q = (sp.q ?? '').trim()
  const vista = parseVista(sp.vista)
  const vistaCal: 'semana' | 'mes' | null =
    vista === 'semana' || vista === 'mes' ? vista : null
  const isCal = vistaCal !== null

  const agora = new Date()
  const baseWhere = {
    tenantId: tenant.id,
    ...(tipoFiltro ? { tipo: tipoFiltro } : {}),
    ...(q ? { titulo: { contains: q, mode: 'insensitive' as const } } : {}),
  }

  type EventoAdminRow = {
    id: string
    titulo: string
    descricao: string | null
    data: Date
    local: string | null
    fotoUrl: string | null
    tipo: TipoEvento
    capacidade: number | null
    serieId: string | null
    sede: { capacidade: number | null } | null
    _count: { rsvps: number }
  }
  type CalRow = { id: string; titulo: string; tipo: TipoEvento; data: Date }

  const calJanela = vistaCal ? janelaCalendario(vistaCal, sp.data) : null

  const [proximos, passados, sedes, calEventos, partidas, afiliacaoId]: [
    EventoAdminRow[],
    EventoAdminRow[],
    Awaited<ReturnType<typeof listSedesAtivasParaEvento>>,
    CalRow[],
    Awaited<ReturnType<typeof listPartidasParaEvento>>,
    string | null,
  ] = await Promise.all([
    vista !== 'lista'
      ? Promise.resolve([] as EventoAdminRow[])
      : (db.evento.findMany({
          where: { ...baseWhere, data: { gte: agora } },
          select: {
            id: true,
            titulo: true,
            descricao: true,
            data: true,
            local: true,
            fotoUrl: true,
            tipo: true,
            capacidade: true,
            serieId: true,
            sede: { select: { capacidade: true } },
            _count: { select: { rsvps: { where: { status: 'CONFIRMADO' } } } },
          },
          orderBy: { data: 'asc' },
          take: 40,
        }) as Promise<EventoAdminRow[]>),
    vista !== 'historico'
      ? Promise.resolve([] as EventoAdminRow[])
      : (db.evento.findMany({
          where: { ...baseWhere, data: { lt: agora } },
          select: {
            id: true,
            titulo: true,
            descricao: true,
            data: true,
            local: true,
            fotoUrl: true,
            tipo: true,
            capacidade: true,
            serieId: true,
            sede: { select: { capacidade: true } },
            _count: { select: { rsvps: { where: { status: 'CONFIRMADO' } } } },
          },
          orderBy: { data: 'desc' },
          take: 40,
        }) as Promise<EventoAdminRow[]>),
    listSedesAtivasParaEvento(tenant.id),
    isCal && calJanela
      ? (db.evento.findMany({
          where: { ...baseWhere, data: { gte: calJanela.gte, lt: calJanela.lt } },
          select: { id: true, titulo: true, tipo: true, data: true },
          orderBy: { data: 'asc' },
          take: 120,
        }) as Promise<CalRow[]>)
      : Promise.resolve([] as CalRow[]),
    listPartidasParaEvento(tenant.id),
    getAfiliacaoIdDoTenant(tenant.id),
  ])

  function serializar(evento: EventoAdminRow, passado: boolean): AdminEventoItem {
    const cap = capacidadeEfetiva({
      capacidade: evento.capacidade,
      sede: evento.sede,
    })
    const confirmados = evento._count.rsvps
    return {
      id: evento.id,
      titulo: evento.titulo,
      descricao: evento.descricao,
      dataLabel: formatarData(evento.data),
      local: evento.local,
      confirmados,
      passado,
      tipo: evento.tipo,
      serieId: evento.serieId,
      lotacaoLabel:
        cap != null
          ? `${confirmados}/${cap} confirmados`
          : `${confirmados} confirmado${confirmados !== 1 ? 's' : ''}`,
      embarcados: null,
    }
  }

  const tituloFiltro = tipoFiltro ? TIPO_EVENTO_LABEL[tipoFiltro] : null
  const emptyHint = tipoFiltro
    ? `Nenhuma ${TIPO_EVENTO_LABEL[tipoFiltro].toLowerCase()} — crie a primeira.`
    : 'Nenhum evento na agenda — crie o primeiro.'

  const calItens: AgendaCalItem[] = calEventos.map((e) => ({
    id: e.id,
    titulo: e.titulo,
    tipo: e.tipo,
    dataIso: e.data.toISOString(),
    href: `/admin/eventos/${e.id}`,
  }))

  const destaqueRow = !isCal && proximos[0] ? proximos[0] : null
  const destaque = destaqueRow ? serializar(destaqueRow, false) : null
  const listaRestante = destaqueRow ? proximos.slice(1) : proximos
  const listaProximos = listaRestante.length > 0 ? listaRestante : proximos

  const iconeTab = 'h-4 w-4 shrink-0'
  const tabs: AdminTabItem[] = [
    { id: 'lista', label: 'Lista', icon: <List className={iconeTab} /> },
    { id: 'semana', label: 'Semana', icon: <CalendarDays className={iconeTab} /> },
    { id: 'mes', label: 'Mês', icon: <CalendarRange className={iconeTab} /> },
    { id: 'historico', label: 'Histórico', icon: <History className={iconeTab} /> },
    {
      id: 'comparecimento',
      label: 'Comparecimento',
      icon: <BarChart3 className={iconeTab} />,
    },
  ]
  const { tabId, panelId } = adminTabIds('vista', vista)

  function hrefFiltro(extra: Record<string, string | undefined>) {
    const p = new URLSearchParams()
    const tipo = extra.tipo !== undefined ? extra.tipo : tipoFiltro
    const v = extra.vista !== undefined ? extra.vista : vista !== 'lista' ? vista : undefined
    const data = extra.data !== undefined ? extra.data : sp.data
    const query = extra.q !== undefined ? extra.q : sp.q
    if (tipo) p.set('tipo', tipo)
    if (v) p.set('vista', v)
    if (data) p.set('data', data)
    if (query) p.set('q', query)
    const s = p.toString()
    return s ? `/admin/eventos?${s}` : '/admin/eventos'
  }

  return (
    <div className="app-container space-y-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">
            {tituloFiltro ? tituloFiltro : 'Agenda'}
          </h1>
          <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
            Eventos, caravanas e ensaios da torcida
          </p>
        </div>
        <NovoEventoButton
          defaultTipo={tipoFiltro ?? 'GERAL'}
          sedes={sedes}
          partidas={partidas}
          temAfiliacao={Boolean(afiliacaoId)}
          redirectTo="/admin/eventos"
        />
      </div>

      <AdminTabs
        tabs={tabs}
        basePath="/admin/eventos"
        activeId={vista}
        paramKey="vista"
        extraParams={{ tipo: tipoFiltro, q: q || undefined, data: sp.data }}
      />

      <div className="sticky top-0 z-10 -mx-1 flex flex-col gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface)_/_0.92)] p-3 backdrop-blur-md sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5 text-xs">
          <Link
            href={hrefFiltro({ tipo: '' })}
            prefetch
            className={[
              'rounded-lg px-2.5 py-1.5 font-medium',
              !tipoFiltro
                ? 'bg-[rgb(var(--color-primary))] text-[rgb(var(--color-primary-on))]'
                : 'border border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))]',
            ].join(' ')}
          >
            Todos
          </Link>
          {(['CARAVANA', 'ENSAIO', 'GERAL'] as const).map((t) => (
            <Link
              key={t}
              href={hrefFiltro({ tipo: t })}
              prefetch
              className={[
                'rounded-lg px-2.5 py-1.5 font-medium',
                tipoFiltro === t
                  ? 'bg-[rgb(var(--color-primary))] text-[rgb(var(--color-primary-on))]'
                  : 'border border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))]',
              ].join(' ')}
            >
              {TIPO_EVENTO_LABEL[t]}
            </Link>
          ))}
        </div>

        <Suspense fallback={<div className="h-8 w-48 animate-pulse rounded-lg bg-[rgb(var(--border))]" />}>
          <AgendaBusca key={sp.q ?? ''} defaultValue={sp.q ?? ''} />
        </Suspense>
      </div>

      <div id={panelId} role="tabpanel" aria-labelledby={tabId} className="space-y-6">
        {vistaCal && (
          <AgendaCalendario
            vista={vistaCal}
            itens={calItens}
            dataRefIso={sp.data}
            basePath="/admin/eventos"
            tipoFiltro={tipoFiltro}
            q={q}
          />
        )}

        {vista === 'comparecimento' && (
          <Suspense fallback={<EventosInsightsSkeleton />}>
            <EventosInsights tenantId={tenant.id} />
          </Suspense>
        )}

        {vista === 'historico' && (
          <AdminEventosList
            eventos={passados.map((e) => serializar(e, true))}
            emptyTitle="Nenhum evento passado"
            emptyDescription="Eventos que já aconteceram aparecem aqui."
          />
        )}

        {vista === 'lista' && (
          <div className="grid gap-5 lg:grid-cols-12 lg:items-start">
            <div className="space-y-3 lg:col-span-8 xl:col-span-9">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                <Calendar className="h-4 w-4" />
                Próximos ({proximos.length})
              </h2>
              <AdminEventosList
                eventos={listaProximos.map((e) => serializar(e, false))}
                emptyTitle={emptyHint}
                emptyDescription="Use Novo evento para abrir o formulário."
              />
            </div>

            {destaque && destaqueRow && (
              <aside className="order-first lg:sticky lg:top-24 lg:order-last lg:col-span-4 xl:col-span-3">
                <ProximoEventoSpotlight
                  id={destaque.id}
                  titulo={destaque.titulo}
                  tipo={destaque.tipo}
                  dataLabel={destaque.dataLabel}
                  local={destaque.local}
                  href={`/admin/eventos/${destaque.id}`}
                  lotacaoLabel={destaque.lotacaoLabel}
                  fotoUrl={destaqueRow.fotoUrl}
                  diasLabel={diasParaEvento(destaqueRow.data)}
                />
              </aside>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
