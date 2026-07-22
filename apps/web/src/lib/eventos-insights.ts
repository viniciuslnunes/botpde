import 'server-only'

import { cache } from 'react'
import { db } from '@torcida/db'
import { capacidadeEfetiva } from '@/lib/eventos-capacidade'
import { resolverIntervaloPeriodo, type Periodo } from '@/lib/admin-insights'

export type EventosComparecimentoResumo = {
  eventosPassados: number
  confirmados: number
  /** Check-ins reais (`checkedInAt`) — independem do status de RSVP (walk-in conta). */
  presentes: number
  /** presentes / confirmados — null sem base. Pode passar de 1 com walk-ins. */
  taxaPresenca: number | null
  /** RSVPs CONFIRMADO sem check-in. */
  noShow: number
  listaEspera: number
  /** Média de confirmados/capacidade nos eventos com capacidade efetiva — null sem eventos com teto. */
  ocupacaoMedia: number | null
}

type EventoPassadoRow = {
  id: string
  capacidade: number | null
  sede: { capacidade: number | null } | null
  _count: { rsvps: number }
}

/** Comparecimento nos eventos com `data` dentro do período (o fim do período é agora → só passados). */
export const resumirComparecimento = cache(async function resumirComparecimento(
  tenantId: string,
  periodo: Periodo,
): Promise<EventosComparecimentoResumo> {
  const { inicio, fim } = resolverIntervaloPeriodo(periodo)
  const whereEvento = { tenantId, data: { gte: inicio, lte: fim } }

  const [eventos, presentes, noShow, listaEspera]: [EventoPassadoRow[], number, number, number] =
    await Promise.all([
      db.evento.findMany({
        where: whereEvento,
        select: {
          id: true,
          capacidade: true,
          sede: { select: { capacidade: true } },
          _count: { select: { rsvps: { where: { status: 'CONFIRMADO' } } } },
        },
      }),
      db.eventoRsvp.count({
        where: { evento: { is: whereEvento }, checkedInAt: { not: null } },
      }),
      db.eventoRsvp.count({
        where: { evento: { is: whereEvento }, status: 'CONFIRMADO', checkedInAt: null },
      }),
      db.eventoRsvp.count({
        where: { evento: { is: whereEvento }, status: 'LISTA_ESPERA' },
      }),
    ])

  const confirmados = eventos.reduce((acc, e) => acc + e._count.rsvps, 0)

  const ocupacoes: number[] = []
  for (const evento of eventos) {
    const cap = capacidadeEfetiva({ capacidade: evento.capacidade, sede: evento.sede })
    if (cap != null && cap > 0) ocupacoes.push(evento._count.rsvps / cap)
  }

  return {
    eventosPassados: eventos.length,
    confirmados,
    presentes,
    taxaPresenca: confirmados > 0 ? presentes / confirmados : null,
    noShow,
    listaEspera,
    ocupacaoMedia:
      ocupacoes.length > 0
        ? ocupacoes.reduce((acc, o) => acc + o, 0) / ocupacoes.length
        : null,
  }
})

export type EventoPresencaItem = {
  rotulo: string
  confirmados: number
  presentes: number
}

function encurtarTitulo(titulo: string): string {
  return titulo.length > 14 ? `${titulo.slice(0, 13)}…` : titulo
}

/** Confirmados × presentes dos últimos `limite` eventos passados, em ordem cronológica. */
export const listarPresencaPorEvento = cache(async function listarPresencaPorEvento(
  tenantId: string,
  limite: number,
): Promise<EventoPresencaItem[]> {
  const agora = new Date()

  type Row = { id: string; titulo: string; _count: { rsvps: number } }
  const eventos: Row[] = await db.evento.findMany({
    where: { tenantId, data: { lt: agora } },
    orderBy: { data: 'desc' },
    take: limite,
    select: {
      id: true,
      titulo: true,
      _count: { select: { rsvps: { where: { status: 'CONFIRMADO' } } } },
    },
  })
  if (eventos.length === 0) return []

  const checkins: Array<{ eventoId: string; _count: { _all: number } }> =
    await db.eventoRsvp.groupBy({
      by: ['eventoId'],
      where: { eventoId: { in: eventos.map((e) => e.id) }, checkedInAt: { not: null } },
      _count: { _all: true },
    })
  const presentesPorEvento = new Map<string, number>(
    checkins.map((c) => [c.eventoId, c._count._all]),
  )

  // Query veio do mais recente para o mais antigo — série exibe em ordem cronológica.
  return eventos
    .slice()
    .reverse()
    .map((e) => ({
      rotulo: encurtarTitulo(e.titulo),
      confirmados: e._count.rsvps,
      presentes: presentesPorEvento.get(e.id) ?? 0,
    }))
})
