import { cache } from 'react'
import { db } from '@torcida/db'
import type { TipoEvento, RsvpStatus } from '@torcida/db'
import { Prisma } from '@torcida/db'
import { getEscopoEventosVisiveis } from '@/lib/eventos'

export type EventoPorTipoLite = {
  id: string
  tipo: TipoEvento
  titulo: string
  descricao: string | null
  data: Date
  local: string | null
  valorVaga: { toNumber(): number } | number | null
  capacidade: number | null
  _count: { rsvps: number }
}

export type EventoEmbarqueLite = {
  id: string
  tipo: TipoEvento
  titulo: string
  descricao: string | null
  data: Date
  local: string | null
  valorVaga: { toNumber(): number } | number | null
  capacidade: number | null
  sedeNome: string | null
  sede: { capacidade: number | null } | null
  rsvps: Array<{
    id: string
    status: RsvpStatus
    checkedInAt: Date | null
    user: {
      id: string
      nome: string | null
      email: string
      avatarUrl: string | null
    }
  }>
}

export const listarEventosPorTipo = cache(async function listarEventosPorTipo(
  tenantId: string,
  tipo: TipoEvento,
  opts?: { futuros?: boolean; limite?: number; userId?: string },
): Promise<EventoPorTipoLite[]> {
  const agora = new Date()
  const escopo = opts?.userId
    ? await getEscopoEventosVisiveis(tenantId, opts.userId)
    : { tenantId }

  const where: Prisma.EventoWhereInput = {
    ...escopo,
    tipo,
  }
  if (opts?.futuros) where.data = { gte: agora }
  else if (opts?.futuros === false) where.data = { lt: agora }

  const rows: EventoPorTipoLite[] = await db.evento.findMany({
    where,
    orderBy: { data: opts?.futuros === false ? 'desc' : 'asc' },
    take: opts?.limite ?? 40,
    select: {
      id: true,
      tipo: true,
      titulo: true,
      descricao: true,
      data: true,
      local: true,
      valorVaga: true,
      capacidade: true,
      _count: { select: { rsvps: { where: { status: 'CONFIRMADO' } } } },
    },
  })
  return rows
})

export const carregarPainelEventosTipo = cache(async function carregarPainelEventosTipo(
  tenantId: string,
  tipo: TipoEvento,
  recentes = 5,
): Promise<{
  proximos: EventoPorTipoLite[]
  totalProximos: number
  confirmadosProximos: number
}> {
  const agora = new Date()
  type AggRow = { id: string; _count: { rsvps: number } }
  const [proximos, agg]: [EventoPorTipoLite[], AggRow[]] = await Promise.all([
    listarEventosPorTipo(tenantId, tipo, { futuros: true, limite: recentes }),
    db.evento.findMany({
      where: { tenantId, tipo, data: { gte: agora } },
      select: {
        id: true,
        _count: { select: { rsvps: { where: { status: 'CONFIRMADO' } } } },
      },
    }),
  ])

  return {
    proximos,
    totalProximos: agg.length,
    confirmadosProximos: agg.reduce((s, e) => s + e._count.rsvps, 0),
  }
})

export const listarProximosEventosTenant = cache(async function listarProximosEventosTenant(
  tenantId: string,
  limite = 5,
  tipos?: TipoEvento[],
): Promise<EventoPorTipoLite[]> {
  const where: Prisma.EventoWhereInput = {
    tenantId,
    data: { gte: new Date() },
    ...(tipos && tipos.length > 0 ? { tipo: { in: tipos } } : {}),
  }
  const rows: EventoPorTipoLite[] = await db.evento.findMany({
    where,
    orderBy: { data: 'asc' },
    take: limite,
    select: {
      id: true,
      tipo: true,
      titulo: true,
      descricao: true,
      data: true,
      local: true,
      valorVaga: true,
      capacidade: true,
      _count: { select: { rsvps: { where: { status: 'CONFIRMADO' } } } },
    },
  })
  return rows
})

export const getEventoEmbarque = cache(async function getEventoEmbarque(
  tenantId: string,
  eventoId: string,
  tipoEsperado?: TipoEvento,
): Promise<EventoEmbarqueLite | null> {
  const row = await db.evento.findFirst({
    where: {
      id: eventoId,
      tenantId,
      ...(tipoEsperado ? { tipo: tipoEsperado } : {}),
    },
    select: {
      id: true,
      tipo: true,
      titulo: true,
      descricao: true,
      data: true,
      local: true,
      valorVaga: true,
      capacidade: true,
      sede: { select: { capacidade: true, nome: true } },
      rsvps: {
        orderBy: [{ status: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          status: true,
          checkedInAt: true,
          user: {
            select: { id: true, nome: true, email: true, avatarUrl: true },
          },
        },
      },
    },
  })
  if (!row) return null
  return {
    id: row.id,
    tipo: row.tipo,
    titulo: row.titulo,
    descricao: row.descricao,
    data: row.data,
    local: row.local,
    valorVaga: row.valorVaga,
    capacidade: row.capacidade,
    sedeNome: row.sede?.nome ?? null,
    sede: row.sede ? { capacidade: row.sede.capacidade } : null,
    rsvps: row.rsvps,
  }
})
