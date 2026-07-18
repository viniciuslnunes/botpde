import { cache } from 'react'
import { db } from '@torcida/db'
import {
  addCalendarDays,
  parseDateOnly,
  startOfMonthParts,
  startOfWeekMonday,
  startOfZonedDayUtc,
  todayPartsInZone,
} from '@/lib/format-datetime'

export type SedeEventoOption = {
  id: string
  nome: string
  capacidade: number | null
}

/** Sedes ativas do tenant — cache por request (drawer create + shell). */
export const listSedesAtivasParaEvento = cache(async function listSedesAtivasParaEvento(
  tenantId: string,
): Promise<SedeEventoOption[]> {
  const rows: SedeEventoOption[] = await db.sede.findMany({
    where: { tenantId, ativa: true },
    select: { id: true, nome: true, capacidade: true },
    orderBy: { nome: 'asc' },
  })
  return rows
})

/** Janela do calendário a partir de `data` (ISO date) e vista — fuso America/Sao_Paulo. */
export function janelaCalendario(
  vista: 'semana' | 'mes',
  dataRef?: string,
): { gte: Date; lt: Date } {
  const base = dataRef ? parseDateOnly(dataRef) : todayPartsInZone()

  if (vista === 'semana') {
    const start = startOfWeekMonday(base)
    const end = addCalendarDays(start, 7)
    return { gte: startOfZonedDayUtc(start), lt: startOfZonedDayUtc(end) }
  }

  // Grade começa na segunda da semana do dia 1 — 42 células (6 semanas)
  const monthStart = startOfMonthParts(base)
  const gte = startOfWeekMonday(monthStart)
  const lt = addCalendarDays(gte, 42)
  return { gte: startOfZonedDayUtc(gte), lt: startOfZonedDayUtc(lt) }
}
