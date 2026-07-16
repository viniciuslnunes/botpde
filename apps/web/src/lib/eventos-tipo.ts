import { cache } from 'react'
import { db } from '@torcida/db'
import type { TipoEvento } from '@torcida/db'
import { Prisma } from '@torcida/db'

export type EventoPorTipoLite = {
  id: string
  tipo: TipoEvento
  titulo: string
  descricao: string | null
  data: Date
  local: string | null
  _count: { rsvps: number }
}

export type EventoEmbarqueLite = {
  id: string
  tipo: TipoEvento
  titulo: string
  descricao: string | null
  data: Date
  local: string | null
  rsvps: Array<{
    id: string
    status: 'CONFIRMADO' | 'RECUSADO'
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
  opts?: { futuros?: boolean; limite?: number },
): Promise<EventoPorTipoLite[]> {
  const agora = new Date()
  const where: Prisma.EventoWhereInput = { tenantId, tipo }
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

export const getEventoEmbarque = cache(async function getEventoEmbarque(
  tenantId: string,
  eventoId: string,
  tipoEsperado?: TipoEvento,
): Promise<EventoEmbarqueLite | null> {
  const row: EventoEmbarqueLite | null = await db.evento.findFirst({
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
  return row
})
