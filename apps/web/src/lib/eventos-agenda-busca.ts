'use server'

import { auth } from '@/lib/auth'
import { db, type Prisma, type TipoEvento } from '@torcida/db'
import { PERMISSIONS, TipoEventoSchema } from '@torcida/types'
import { assertAnyPermission } from '@/lib/authz'
import { resolveTenantMinhaTorcida } from '@/lib/comunidade-contexto'
import { getEscopoEventosVisiveis } from '@/lib/eventos'
import { slugDepartamentoDoEvento } from '@/lib/eventos-admin-href'
import { REACTIVE_SEARCH_MAX_SUGESTOES } from '@/lib/reactive-search/types'

export type AgendaTypeaheadHit = {
  id: string
  titulo: string
  tipo: TipoEvento
  dataIso: string
  dataLabel: string
  local: string | null
  fotoUrl: string | null
  departamentoSlug: string | null
}

const LIMITE = REACTIVE_SEARCH_MAX_SUGESTOES

const dataFmt = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

type EventoTypeaheadRow = {
  id: string
  titulo: string
  tipo: TipoEvento
  data: Date
  local: string | null
  fotoUrl: string | null
  departamento: { slug: string } | null
  projeto: { departamento: { slug: string } | null } | null
}

function mapHit(row: EventoTypeaheadRow): AgendaTypeaheadHit {
  return {
    id: row.id,
    titulo: row.titulo,
    tipo: row.tipo,
    dataIso: row.data.toISOString(),
    dataLabel: dataFmt.format(row.data).replace('.', ''),
    local: row.local,
    fotoUrl: row.fotoUrl,
    departamentoSlug: slugDepartamentoDoEvento(row),
  }
}

const SELECT_TYPEAHEAD = {
  id: true,
  titulo: true,
  tipo: true,
  data: true,
  local: true,
  fotoUrl: true,
  departamento: { select: { slug: true } },
  projeto: { select: { departamento: { select: { slug: true } } } },
} as const

async function consultar(where: Prisma.EventoWhereInput): Promise<AgendaTypeaheadHit[]> {
  const agora = new Date()
  const futuros: EventoTypeaheadRow[] = await db.evento.findMany({
    where: { ...where, data: { gte: agora } },
    select: SELECT_TYPEAHEAD,
    orderBy: { data: 'asc' },
    take: LIMITE,
  })
  const resto = LIMITE - futuros.length
  const passados: EventoTypeaheadRow[] =
    resto > 0
      ? await db.evento.findMany({
          where: { ...where, data: { lt: agora } },
          select: SELECT_TYPEAHEAD,
          orderBy: { data: 'desc' },
          take: resto,
        })
      : []
  return [...futuros, ...passados].map(mapHit)
}

/** Sugestões da busca da Agenda (portal e admin). */
export async function buscarEventosAgendaAction(opts: {
  termo: string
  tipo?: string | null
  admin?: boolean
}): Promise<AgendaTypeaheadHit[]> {
  const termo = opts.termo.trim()
  if (!termo) return []

  const tipoParsed = TipoEventoSchema.safeParse(opts.tipo)
  const tipoFiltro = tipoParsed.success ? tipoParsed.data : undefined

  if (opts.admin) {
    const { tenant } = await assertAnyPermission([
      PERMISSIONS.EVENTS_VIEW,
      PERMISSIONS.EVENTS_MANAGE,
      PERMISSIONS.EVENTS_CREATE,
    ])
    return consultar({
      tenantId: tenant.id,
      titulo: { contains: termo, mode: 'insensitive' },
      ...(tipoFiltro ? { tipo: tipoFiltro } : {}),
    })
  }

  const session = await auth()
  if (!session?.user?.id) return []
  const tenant = await resolveTenantMinhaTorcida(session.user.id, session.user.email)
  if (!tenant) return []
  const escopo = await getEscopoEventosVisiveis(tenant.id, session.user.id)
  return consultar({
    AND: [
      escopo,
      { titulo: { contains: termo, mode: 'insensitive' } },
      ...(tipoFiltro ? [{ tipo: tipoFiltro }] : []),
    ],
  })
}
