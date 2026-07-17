import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { getEscopoEventosVisiveis } from '@/lib/eventos'
import {
  EventosListAnimated,
  type EventoCardItem,
} from '@/components/portal/eventos-list-animated'
import { formatNomeTorcida } from '@torcida/types'

interface EventoListItem {
  id: string
  titulo: string
  data: Date
  local: string | null
  tenantId: string
  tenant: { nome: string }
  _count: { rsvps: number }
}

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

function serializarEvento(
  evento: EventoListItem,
  tenantId: string,
  passado: boolean,
  rsvpStatus?: string,
): EventoCardItem {
  return {
    id: evento.id,
    titulo: evento.titulo,
    dataLabel: formatarData(new Date(evento.data)),
    local: evento.local,
    tenantNome: evento.tenantId !== tenantId ? formatNomeTorcida(evento.tenant.nome) : null,
    passado,
    diasLabel: passado ? null : diasParaEvento(new Date(evento.data)),
    rsvpStatus,
    confirmados: evento._count.rsvps,
  }
}

function ListaFallback() {
  return (
    <div className="animate-pulse space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-24 rounded-xl bg-[rgb(var(--border))]" />
      ))}
    </div>
  )
}

export async function EventosProximosSection() {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  const agora = new Date()

  const escopoVisivel = tenant
    ? await getEscopoEventosVisiveis(tenant.id, session?.user?.id)
    : null

  const [proximos, meuRsvp] = await Promise.all([
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

  if (!tenant) return null

  const itens = proximos.map((e) =>
    serializarEvento(e, tenant.id, false, rsvpMap.get(e.id)),
  )

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
        Próximos eventos
      </h2>
      <EventosListAnimated eventos={itens} />
    </div>
  )
}

export async function EventosPassadosSection() {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  const agora = new Date()

  const escopoVisivel = tenant
    ? await getEscopoEventosVisiveis(tenant.id, session?.user?.id)
    : null

  const passados =
    tenant && escopoVisivel
      ? ((await db.evento.findMany({
          where: { ...escopoVisivel, data: { lt: agora } },
          include: {
            _count: { select: { rsvps: true } },
            tenant: { select: { nome: true } },
          },
          orderBy: { data: 'desc' },
          take: 5,
        })) as EventoListItem[])
      : []

  if (!tenant || passados.length === 0) return null

  const itens = passados.map((e) => serializarEvento(e, tenant.id, true))

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
        Histórico
      </h2>
      <EventosListAnimated
        eventos={itens}
        emptyTitle="Nenhum evento no histórico"
        emptyDescription=""
      />
    </div>
  )
}

export { ListaFallback as EventosListaFallback }
