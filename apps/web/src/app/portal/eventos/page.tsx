import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { getTenantFromHost, getUserPermissionsInTenant } from '@/lib/tenant'
import { getEscopoEventosVisiveis } from '@/lib/eventos'
import {
  EventosListAnimated,
  type EventoCardItem,
} from '@/components/portal/eventos-list-animated'
import {
  formatNomeTorcida,
  PERMISSIONS,
  TIPO_EVENTO_LABEL,
  TipoEventoSchema,
  calculateEffectivePermissions,
  hasPermission,
} from '@torcida/types'
import Link from 'next/link'
import { NovoEventoButton } from '@/components/eventos/novo-evento-button'
import { AgendaCalendario, type AgendaCalItem } from '@/components/eventos/agenda-calendario'
import { AgendaBusca } from '@/components/eventos/agenda-busca'
import { ProximoEventoSpotlight } from '@/components/eventos/proximo-evento-spotlight'
import type { Metadata } from 'next'
import type { TipoEvento } from '@torcida/db'
import { capacidadeEfetiva } from '@/lib/eventos-capacidade'
import { janelaCalendario, listSedesAtivasParaEvento } from '@/lib/eventos-query'
import { getAfiliacaoIdDoTenant, listPartidasParaEvento } from '@/lib/partidas'

export const metadata: Metadata = { title: 'Agenda' }

interface EventoListItem {
  id: string
  titulo: string
  data: Date
  local: string | null
  fotoUrl: string | null
  tipo: TipoEvento
  tenantId: string
  capacidade: number | null
  tenant: { nome: string }
  sede: { capacidade: number | null } | null
  _count: { rsvps: number }
}

function formatarDataLista(data: Date) {
  const d = new Date(data)
  const dia = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  }).format(d)
  const hora = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
  return `${dia.replace('.', '')} · ${hora}`
}

function diasParaEvento(data: Date) {
  const diff = Math.ceil((new Date(data).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  if (diff === 0) return 'Hoje'
  if (diff === 1) return 'Amanhã'
  return `Em ${diff} dias`
}

function serializarEvento(
  evento: EventoListItem,
  tenantId: string,
  passado: boolean,
  rsvpStatus?: string,
): EventoCardItem {
  const cap = capacidadeEfetiva(evento)
  const lotacao =
    cap != null ? `${evento._count.rsvps}/${cap}` : String(evento._count.rsvps)
  return {
    id: evento.id,
    titulo: evento.titulo,
    dataLabel: formatarDataLista(new Date(evento.data)),
    local: evento.local,
    fotoUrl: evento.fotoUrl,
    tenantNome: evento.tenantId !== tenantId ? formatNomeTorcida(evento.tenant.nome) : null,
    passado,
    diasLabel: passado ? null : diasParaEvento(new Date(evento.data)),
    rsvpStatus,
    confirmados: evento._count.rsvps,
    tipo: evento.tipo,
    lotacaoLabel: lotacao,
  }
}

function ListaFallback() {
  return (
    <div className="animate-pulse space-y-1.5">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-xl border border-[rgb(var(--border))] px-3 py-2.5"
        >
          <div className="h-14 w-14 shrink-0 rounded-lg bg-[rgb(var(--border))]" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-24 rounded bg-[rgb(var(--border))]" />
            <div className="h-3.5 w-3/4 rounded bg-[rgb(var(--border))]" />
            <div className="h-3 w-1/2 rounded bg-[rgb(var(--border))]" />
          </div>
        </div>
      ))}
    </div>
  )
}

type Props = {
  searchParams: Promise<{ tipo?: string; q?: string; vista?: string; data?: string }>
}

export default async function EventosPage({ searchParams }: Props) {
  const sp = await searchParams
  const tipoParsed = TipoEventoSchema.safeParse(sp.tipo)
  const tipoFiltro = tipoParsed.success ? tipoParsed.data : undefined
  const vista = sp.vista === 'semana' || sp.vista === 'mes' ? sp.vista : 'lista'
  const q = (sp.q ?? '').trim()

  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])

  let podeCriar = false
  let sedes: Awaited<ReturnType<typeof listSedesAtivasParaEvento>> = []
  let partidas: Awaited<ReturnType<typeof listPartidasParaEvento>> = []
  let temAfiliacao = false
  if (session?.user?.id && tenant) {
    const { rolePermissions, overrides } = await getUserPermissionsInTenant(
      session.user.id,
      tenant.id,
    )
    const effective = calculateEffectivePermissions(rolePermissions, overrides)
    podeCriar =
      hasPermission(effective, PERMISSIONS.EVENTS_CREATE) ||
      hasPermission(effective, PERMISSIONS.EVENTS_MANAGE)
    if (podeCriar) {
      ;[sedes, partidas, temAfiliacao] = await Promise.all([
        listSedesAtivasParaEvento(tenant.id),
        listPartidasParaEvento(tenant.id),
        getAfiliacaoIdDoTenant(tenant.id).then((id) => Boolean(id)),
      ])
    }
  }

  const tituloFiltro = tipoFiltro ? TIPO_EVENTO_LABEL[tipoFiltro] : null

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
    return s ? `/portal/eventos?${s}` : '/portal/eventos'
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">
            {tituloFiltro ?? 'Agenda'}
          </h1>
          <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
            Eventos, caravanas e ensaios da torcida
          </p>
        </div>
        {podeCriar && (
          <NovoEventoButton
            defaultTipo={tipoFiltro ?? 'GERAL'}
            sedes={sedes}
            partidas={partidas}
            temAfiliacao={temAfiliacao}
            redirectTo="/portal/eventos"
          />
        )}
      </div>

      <div className="sticky top-0 z-10 flex flex-col gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface)_/_0.92)] p-3 backdrop-blur-md sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5 text-xs">
          <Link
            href={hrefFiltro({ tipo: '' })}
            prefetch
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
              href={hrefFiltro({ tipo: t })}
              prefetch
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
        <div className="flex flex-wrap items-center gap-2">
          <Suspense fallback={<div className="h-8 w-48 animate-pulse rounded-lg bg-[rgb(var(--border))]" />}>
            <AgendaBusca key={q} defaultValue={q} />
          </Suspense>
          <div
            className="inline-flex rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] p-0.5 text-xs"
            role="group"
            aria-label="Vista da agenda"
          >
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
                  'rounded-md px-2.5 py-1.5 font-medium transition-colors',
                  vista === id
                    ? 'bg-[rgb(var(--surface))] text-[rgb(var(--foreground))] shadow-sm'
                    : 'text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]',
                ].join(' ')}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <Suspense fallback={<ListaFallback />}>
        <AgendaConteudo
          vista={vista}
          tipoFiltro={tipoFiltro}
          q={q}
          dataRef={sp.data}
        />
      </Suspense>
    </div>
  )
}

async function AgendaConteudo({
  vista,
  tipoFiltro,
  q,
  dataRef,
}: {
  vista: 'lista' | 'semana' | 'mes'
  tipoFiltro?: TipoEvento
  q: string
  dataRef?: string
}) {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!tenant) return null

  const agora = new Date()
  const escopoVisivel = await getEscopoEventosVisiveis(tenant.id, session?.user?.id)
  const baseWhere = {
    ...escopoVisivel,
    ...(tipoFiltro ? { tipo: tipoFiltro } : {}),
    ...(q ? { titulo: { contains: q, mode: 'insensitive' as const } } : {}),
  }

  if (vista !== 'lista') {
    type CalRow = { id: string; titulo: string; tipo: TipoEvento; data: Date }
    const janela = janelaCalendario(vista, dataRef)
    const calEventos: CalRow[] = await db.evento.findMany({
      where: { ...baseWhere, data: { gte: janela.gte, lt: janela.lt } },
      select: { id: true, titulo: true, tipo: true, data: true },
      orderBy: { data: 'asc' },
      take: 120,
    })
    const calItens: AgendaCalItem[] = calEventos.map((e: CalRow) => ({
      id: e.id,
      titulo: e.titulo,
      tipo: e.tipo,
      dataIso: e.data.toISOString(),
      href: `/portal/eventos/${e.id}`,
    }))
    return (
      <AgendaCalendario
        vista={vista}
        itens={calItens}
        dataRefIso={dataRef}
        basePath="/portal/eventos"
        tipoFiltro={tipoFiltro}
      />
    )
  }

  const [proximos, passados, meuRsvp] = await Promise.all([
    db.evento.findMany({
      where: { ...baseWhere, data: { gte: agora } },
      select: {
        id: true,
        titulo: true,
        data: true,
        local: true,
        fotoUrl: true,
        tipo: true,
        tenantId: true,
        capacidade: true,
        _count: { select: { rsvps: { where: { status: 'CONFIRMADO' } } } },
        tenant: { select: { nome: true } },
        sede: { select: { capacidade: true } },
      },
      orderBy: { data: 'asc' },
      take: 40,
    }) as Promise<EventoListItem[]>,
    db.evento.findMany({
      where: { ...baseWhere, data: { lt: agora } },
      select: {
        id: true,
        titulo: true,
        data: true,
        local: true,
        fotoUrl: true,
        tipo: true,
        tenantId: true,
        capacidade: true,
        _count: { select: { rsvps: { where: { status: 'CONFIRMADO' } } } },
        tenant: { select: { nome: true } },
        sede: { select: { capacidade: true } },
      },
      orderBy: { data: 'desc' },
      take: 8,
    }) as Promise<EventoListItem[]>,
    session?.user?.id
      ? db.eventoRsvp.findMany({
          where: {
            userId: session.user.id,
            evento: { tenantId: tenant.id, data: { gte: agora } },
          },
          select: { eventoId: true, status: true },
        })
      : [],
  ])

  const rsvpMap = new Map(
    (meuRsvp as { eventoId: string; status: string }[]).map((r) => [r.eventoId, r.status]),
  )

  const emptyTitle = tipoFiltro
    ? `Nenhuma ${TIPO_EVENTO_LABEL[tipoFiltro].toLowerCase()} agendada`
    : 'Nenhum evento agendado'

  const cards = proximos.map((e) =>
    serializarEvento(e, tenant.id, false, rsvpMap.get(e.id)),
  )
  const destaque = cards[0]
  const resto = cards.slice(1)

  return (
    <div className="space-y-6">
      {destaque && (
        <ProximoEventoSpotlight
          id={destaque.id}
          titulo={destaque.titulo}
          tipo={destaque.tipo ?? 'GERAL'}
          dataLabel={destaque.dataLabel}
          local={destaque.local}
          href={`/portal/eventos/${destaque.id}`}
          lotacaoLabel={
            destaque.lotacaoLabel ? `${destaque.lotacaoLabel} conf.` : null
          }
          fotoUrl={destaque.fotoUrl}
          diasLabel={destaque.diasLabel}
        />
      )}
      <div>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            Próximos
          </h2>
          {resto.length > 0 && (
            <p className="text-[11px] tabular-nums text-[rgb(var(--foreground-muted))]">
              {resto.length} na fila
            </p>
          )}
        </div>
        <EventosListAnimated
          eventos={resto}
          emptyTitle={destaque ? 'Nada mais na fila' : emptyTitle}
          emptyDescription={
            destaque
              ? 'Só o próximo compromisso acima por enquanto.'
              : 'Quando houver algo marcado, aparece aqui.'
          }
        />
      </div>
      {passados.length > 0 && (
        <details className="group">
          <summary className="mb-3 cursor-pointer text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            Histórico
          </summary>
          <EventosListAnimated
            eventos={passados.map((e) => serializarEvento(e, tenant.id, true))}
            emptyTitle="Nenhum evento no histórico"
            emptyDescription=""
          />
        </details>
      )}
    </div>
  )
}
