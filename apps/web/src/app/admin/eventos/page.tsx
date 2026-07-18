import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { assertPermission } from '@/lib/authz'
import { PERMISSIONS, TIPO_EVENTO_LABEL, TipoEventoSchema } from '@torcida/types'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { AdminEventosList, type AdminEventoItem } from './admin-eventos-list'
import { NovoEventoButton } from '@/components/eventos/novo-evento-button'
import { AgendaCalendario, type AgendaCalItem } from '@/components/eventos/agenda-calendario'
import { AgendaBusca } from '@/components/eventos/agenda-busca'
import { ProximoEventoSpotlight } from '@/components/eventos/proximo-evento-spotlight'
import { Calendar } from 'lucide-react'
import type { Metadata } from 'next'
import type { TipoEvento } from '@torcida/db'
import { capacidadeEfetiva } from '@/lib/eventos-capacidade'
import { janelaCalendario, listSedesAtivasParaEvento } from '@/lib/eventos-query'
import { getAfiliacaoIdDoTenant, listPartidasParaEvento } from '@/lib/partidas'

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
  const q = (sp.q ?? '').trim()
  const vista = sp.vista === 'semana' || sp.vista === 'mes' ? sp.vista : 'lista'
  const isCal = vista !== 'lista'

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
    tipo: TipoEvento
    capacidade: number | null
    serieId: string | null
    sede: { capacidade: number | null } | null
    _count: { rsvps: number }
  }
  type CalRow = { id: string; titulo: string; tipo: TipoEvento; data: Date }

  const calJanela = isCal ? janelaCalendario(vista, sp.data) : null

  const [proximos, passados, sedes, calEventos, partidas, afiliacaoId]: [
    EventoAdminRow[],
    EventoAdminRow[],
    Awaited<ReturnType<typeof listSedesAtivasParaEvento>>,
    CalRow[],
    Awaited<ReturnType<typeof listPartidasParaEvento>>,
    string | null,
  ] = await Promise.all([
    isCal
      ? Promise.resolve([] as EventoAdminRow[])
      : (db.evento.findMany({
          where: { ...baseWhere, data: { gte: agora } },
          select: {
            id: true,
            titulo: true,
            descricao: true,
            data: true,
            local: true,
            tipo: true,
            capacidade: true,
            serieId: true,
            sede: { select: { capacidade: true } },
            _count: { select: { rsvps: { where: { status: 'CONFIRMADO' } } } },
          },
          orderBy: { data: 'asc' },
          take: 40,
        }) as Promise<EventoAdminRow[]>),
    isCal
      ? Promise.resolve([] as EventoAdminRow[])
      : (db.evento.findMany({
          where: { ...baseWhere, data: { lt: agora } },
          select: {
            id: true,
            titulo: true,
            descricao: true,
            data: true,
            local: true,
            tipo: true,
            capacidade: true,
            serieId: true,
            sede: { select: { capacidade: true } },
            _count: { select: { rsvps: { where: { status: 'CONFIRMADO' } } } },
          },
          orderBy: { data: 'desc' },
          take: 10,
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

  const destaque = !isCal && proximos[0] ? serializar(proximos[0], false) : null
  const listaRestante = destaque ? proximos.slice(1) : proximos

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

        <div className="flex flex-wrap items-center gap-2">
          <Suspense fallback={<div className="h-8 w-48 animate-pulse rounded-lg bg-[rgb(var(--border))]" />}>
            <AgendaBusca key={sp.q ?? ''} defaultValue={sp.q ?? ''} />
          </Suspense>
          <div className="flex gap-1 text-xs">
            {(
              [
                ['lista', 'Lista'],
                ['semana', 'Semana'],
                ['mes', 'Mês'],
              ] as const
            ).map(([id, label]) => (
              <Link
                key={id}
                href={hrefFiltro({ vista: id === 'lista' ? '' : id })}
                prefetch
                className={[
                  'rounded-lg px-2.5 py-1.5 font-medium',
                  vista === id
                    ? 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground))]'
                    : 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]',
                ].join(' ')}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {isCal ? (
        <AgendaCalendario
          vista={vista}
          itens={calItens}
          dataRefIso={sp.data}
          basePath="/admin/eventos"
          tipoFiltro={tipoFiltro}
        />
      ) : (
        <>
          {destaque && (
            <ProximoEventoSpotlight
              id={destaque.id}
              titulo={destaque.titulo}
              tipo={destaque.tipo}
              dataLabel={destaque.dataLabel}
              local={destaque.local}
              href={`/admin/eventos/${destaque.id}`}
              lotacaoLabel={destaque.lotacaoLabel}
            />
          )}

          <div>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
              <Calendar className="h-4 w-4" />
              Próximos ({proximos.length})
            </h2>
            <AdminEventosList
              eventos={listaRestante.map((e) => serializar(e, false))}
              emptyTitle={emptyHint}
              emptyDescription="Use Novo evento para abrir o formulário."
            />
          </div>

          {passados.length > 0 && (
            <details className="group">
              <summary className="mb-3 cursor-pointer text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                Histórico (últimos {passados.length})
              </summary>
              <AdminEventosList eventos={passados.map((e) => serializar(e, true))} />
            </details>
          )}
        </>
      )}
    </div>
  )
}
