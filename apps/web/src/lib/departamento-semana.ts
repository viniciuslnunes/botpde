import {
  addCalendarDays,
  dayKeyInZone,
  startOfWeekMonday,
  startOfZonedDayUtc,
  todayPartsInZone,
} from '@/lib/format-datetime'
import { listPartidasNaJanela, type PartidaOption } from '@/lib/partidas'
import type { AgendaSemanaCompactItem, AgendaSemanaPartidaItem } from '@/components/eventos/agenda-semana-compact'

/** Janela seg–dom (America/Sao_Paulo) da semana corrente. */
export function janelaSemanaCorrente(now: Date = new Date()): { gte: Date; lt: Date } {
  const hoje = todayPartsInZone(now)
  const start = startOfWeekMonday(hoje)
  const end = addCalendarDays(start, 7)
  return { gte: startOfZonedDayUtc(start), lt: startOfZonedDayUtc(end) }
}

export function serializarPartidasSemana(partidas: PartidaOption[]): AgendaSemanaPartidaItem[] {
  return partidas.map((p) => ({
    id: p.id,
    dataIso: p.dataHora.toISOString(),
    adversario: p.adversario,
    mando: p.mando,
    competicao: p.competicao,
  }))
}

export async function carregarPartidasSemanaTenant(
  tenantId: string,
): Promise<AgendaSemanaPartidaItem[]> {
  const { gte, lt } = janelaSemanaCorrente()
  const rows = await listPartidasNaJanela(tenantId, gte, lt)
  return serializarPartidasSemana(rows)
}

export type EventoSemanaRow = {
  id: string
  titulo: string
  tipo: string
  data: Date
  local: string | null
  partidaId?: string | null
  projetoId?: string | null
  serieId?: string | null
}

export function serializarEventosSemana(
  eventos: EventoSemanaRow[],
  hrefOf: (e: EventoSemanaRow) => string,
): AgendaSemanaCompactItem[] {
  return eventos
    .slice()
    .sort((a, b) => a.data.getTime() - b.data.getTime())
    .map((e) => ({
      id: e.id,
      titulo: e.titulo,
      tipo: e.tipo,
      dataIso: e.data.toISOString(),
      href: hrefOf(e),
      local: e.local,
      partidaId: e.partidaId ?? null,
      projetoId: e.projetoId ?? null,
      serieId: e.serieId ?? null,
    }))
}

export { dayKeyInZone }
