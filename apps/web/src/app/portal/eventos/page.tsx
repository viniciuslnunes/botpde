import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { db, withDbRetry } from '@torcida/db'
import { getUserPermissionsInTenant } from '@/lib/tenant'
import { resolveTenantMinhaTorcida } from '@/lib/comunidade-contexto'
import { getEscopoEventosVisiveis, diasParaEvento } from '@/lib/eventos'
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
import { PortalModuloHeader } from '@/components/portal/portal-modulo-header'
import type { Metadata } from 'next'
import type { TipoEvento } from '@torcida/db'
import { capacidadeEfetiva } from '@/lib/eventos-capacidade'
import { janelaCalendario, listSedesAtivasParaEvento } from '@/lib/eventos-query'
import { getAfiliacaoIdDoTenant, listPartidasParaEvento } from '@/lib/partidas'
import { listarProjetosParaEvento } from '@/lib/eventos-tipo'

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
    <div className="grid animate-pulse grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-2xl border border-[rgb(var(--border))]"
        >
          <div className="aspect-[5/3] bg-[rgb(var(--border))]" />
          <div className="space-y-2 p-3.5">
            <div className="h-3 w-20 rounded bg-[rgb(var(--border))]" />
            <div className="h-4 w-4/5 rounded bg-[rgb(var(--border))]" />
            <div className="h-3 w-2/3 rounded bg-[rgb(var(--border))]" />
          </div>
        </div>
      ))}
    </div>
  )
}

function CalendarioFallback() {
  return (
    <div className="overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface)_/_0.75)]">
      <div className="flex items-end justify-between border-b border-[rgb(var(--border))] px-4 py-4 sm:px-5">
        <div className="space-y-2">
          <div className="h-3 w-10 animate-pulse rounded bg-[rgb(var(--border))]" />
          <div className="h-7 w-40 animate-pulse rounded bg-[rgb(var(--border))]" />
        </div>
        <div className="flex gap-1.5">
          <div className="h-9 w-9 animate-pulse rounded-xl bg-[rgb(var(--border))]" />
          <div className="h-9 w-16 animate-pulse rounded-xl bg-[rgb(var(--border))]" />
          <div className="h-9 w-9 animate-pulse rounded-xl bg-[rgb(var(--border))]" />
        </div>
      </div>
      <div className="grid lg:grid-cols-12">
        <div className="p-3 sm:p-4 lg:col-span-8">
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: 35 }).map((_, i) => (
              <div
                key={i}
                className="min-h-[64px] animate-pulse rounded-xl bg-[rgb(var(--border)_/_0.45)] sm:min-h-[76px]"
              />
            ))}
          </div>
        </div>
        <div className="hidden space-y-3 border-l border-[rgb(var(--border))] p-5 lg:col-span-4 lg:block">
          <div className="h-4 w-32 animate-pulse rounded bg-[rgb(var(--border))]" />
          <div className="h-24 animate-pulse rounded-2xl bg-[rgb(var(--border)_/_0.45)]" />
          <div className="h-24 animate-pulse rounded-2xl bg-[rgb(var(--border)_/_0.45)]" />
        </div>
      </div>
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
  const vista =
    sp.vista === 'lista' || sp.vista === 'semana' ? sp.vista : 'mes'
  const q = (sp.q ?? '').trim()

  const session = await auth()
  const tenant = session?.user?.id
    ? await resolveTenantMinhaTorcida(session.user.id, session.user.email)
    : null

  let podeCriar = false
  let sedes: Awaited<ReturnType<typeof listSedesAtivasParaEvento>> = []
  let partidas: Awaited<ReturnType<typeof listPartidasParaEvento>> = []
  let projetos: Awaited<ReturnType<typeof listarProjetosParaEvento>> = []
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
      ;[sedes, partidas, projetos, temAfiliacao] = await Promise.all([
        listSedesAtivasParaEvento(tenant.id),
        listPartidasParaEvento(tenant.id),
        listarProjetosParaEvento(tenant.id),
        getAfiliacaoIdDoTenant(tenant.id).then((id) => Boolean(id)),
      ])
    }
  }

  const tituloFiltro = tipoFiltro ? TIPO_EVENTO_LABEL[tipoFiltro] : null

  function hrefFiltro(extra: Record<string, string | undefined>) {
    const p = new URLSearchParams()
    const tipo = extra.tipo !== undefined ? extra.tipo : tipoFiltro
    const v =
      extra.vista !== undefined
        ? extra.vista
        : vista !== 'mes'
          ? vista
          : undefined
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
      <PortalModuloHeader
        kicker="[ Eventos da torcida ]"
        title={tituloFiltro ?? 'Agenda'}
        description="Eventos, caravanas e ensaios da torcida"
        actions={
          podeCriar ? (
            <NovoEventoButton
              defaultTipo={tipoFiltro ?? 'GERAL'}
              sedes={sedes}
              partidas={partidas}
              projetos={projetos}
              temAfiliacao={temAfiliacao}
              redirectTo="/portal/eventos"
            />
          ) : undefined
        }
      />

      <div className="sticky top-0 z-10 flex flex-col gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface)_/_0.92)] p-3 backdrop-blur-md sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div
          className="flex flex-wrap gap-1.5 text-xs"
          role="group"
          aria-label="Filtrar por tipo"
        >
          <Link
            href={hrefFiltro({ tipo: '' })}
            prefetch={false}
            className={[
              'portal-chip rounded-lg px-3 py-1.5 transition-colors',
              !tipoFiltro
                ? 'bg-[rgb(var(--color-primary))] text-[rgb(var(--color-primary-on))]'
                : 'border border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]',
            ].join(' ')}
          >
            Todos
          </Link>
          {(['CARAVANA', 'ENSAIO', 'GERAL'] as const).map((t) => (
            <Link
              key={t}
              href={hrefFiltro({ tipo: t })}
              prefetch={false}
              className={[
                'portal-chip rounded-lg px-3 py-1.5 transition-colors',
                tipoFiltro === t
                  ? 'bg-[rgb(var(--color-primary))] text-[rgb(var(--color-primary-on))]'
                  : 'border border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]',
              ].join(' ')}
            >
              {TIPO_EVENTO_LABEL[t]}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Suspense fallback={<div className="h-8 w-48 animate-pulse rounded-lg bg-[rgb(var(--border))]" />}>
            <AgendaBusca defaultValue={q} />
          </Suspense>
          <div
            className="inline-flex rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] p-0.5 text-xs"
            role="group"
            aria-label="Vista da agenda"
          >
            {(
              [
                ['mes', 'Mês'],
                ['semana', 'Semana'],
                ['lista', 'Grade'],
              ] as const
            ).map(([id, label]) => (
              <Link
                key={id}
                href={hrefFiltro({ vista: id === 'mes' ? '' : id })}
                prefetch={false}
                className={[
                  'portal-chip rounded-md px-3 py-1.5 transition-colors',
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

      <Suspense fallback={vista === 'lista' ? <ListaFallback /> : <CalendarioFallback />}>
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
  const session = await auth()
  const tenant = session?.user?.id
    ? await resolveTenantMinhaTorcida(session.user.id, session.user.email)
    : null
  if (!tenant) return null

  const agora = new Date()
  const escopoVisivel = await getEscopoEventosVisiveis(tenant.id, session?.user?.id)
  const baseWhere = {
    ...escopoVisivel,
    ...(tipoFiltro ? { tipo: tipoFiltro } : {}),
    ...(q ? { titulo: { contains: q, mode: 'insensitive' as const } } : {}),
  }

  if (vista !== 'lista') {
    type CalRow = {
      id: string
      titulo: string
      tipo: TipoEvento
      data: Date
      fotoUrl: string | null
      local: string | null
    }
    const janela = janelaCalendario(vista, dataRef)
    // Leitura idempotente com retry (blips do proxy Railway no bootstrap da Agenda).
    const calEventos: CalRow[] = await withDbRetry(
      () =>
        db.evento.findMany({
          where: { ...baseWhere, data: { gte: janela.gte, lt: janela.lt } },
          select: { id: true, titulo: true, tipo: true, data: true, fotoUrl: true, local: true },
          orderBy: { data: 'asc' },
          take: 120,
        }) as Promise<CalRow[]>,
    )
    const calItens: AgendaCalItem[] = calEventos.map((e: CalRow) => ({
      id: e.id,
      titulo: e.titulo,
      tipo: e.tipo,
      dataIso: e.data.toISOString(),
      href: `/portal/eventos/${e.id}`,
      fotoUrl: e.fotoUrl,
      local: e.local,
    }))
    return (
      <AgendaCalendario
        vista={vista}
        itens={calItens}
        dataRefIso={dataRef}
        basePath="/portal/eventos"
        tipoFiltro={tipoFiltro}
        q={q}
      />
    )
  }

  // Leituras idempotentes com retry (blips do proxy Railway no bootstrap da Agenda).
  const userId = session?.user?.id
  const [proximos, passados, meuRsvp] = await Promise.all([
    withDbRetry(
      () =>
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
    ),
    withDbRetry(
      () =>
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
    ),
    userId
      ? withDbRetry(
          () =>
            db.eventoRsvp.findMany({
              where: {
                userId,
                evento: { tenantId: tenant.id, data: { gte: agora } },
              },
              select: { eventoId: true, status: true },
            }) as Promise<{ eventoId: string; status: string }[]>,
        )
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
    <div className="grid gap-5 lg:grid-cols-12 lg:items-start">
      <div className="space-y-5 lg:col-span-8 xl:col-span-9">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="portal-kicker text-[rgb(var(--foreground-muted))]">
            Próximos
          </h2>
          {cards.length > 0 && (
            <p className="text-[11px] tabular-nums text-[rgb(var(--foreground-muted))]">
              {cards.length} na fila
            </p>
          )}
        </div>
        <EventosListAnimated
          eventos={resto.length > 0 ? resto : cards}
          emptyTitle={emptyTitle}
          emptyDescription="Quando houver algo marcado, aparece aqui."
        />
        {passados.length > 0 && (
          <details className="group">
            <summary className="portal-kicker mb-3 cursor-pointer text-[rgb(var(--foreground-muted))]">
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
      {destaque && (
        <aside className="lg:sticky lg:top-24 lg:col-span-4 xl:col-span-3">
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
        </aside>
      )}
    </div>
  )
}
