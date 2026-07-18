import { cache } from 'react'
import { db } from '@torcida/db'

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

/** Janela do calendário a partir de `data` (ISO date) e vista. */
export function janelaCalendario(
  vista: 'semana' | 'mes',
  dataRef?: string,
): { gte: Date; lt: Date } {
  const base = dataRef ? new Date(`${dataRef}T12:00:00`) : new Date()
  if (Number.isNaN(base.getTime())) {
    const agora = new Date()
    return janelaCalendario(vista, agora.toISOString().slice(0, 10))
  }

  if (vista === 'semana') {
    const day = base.getDay()
    const diff = day === 0 ? -6 : 1 - day
    const start = new Date(base)
    start.setDate(base.getDate() + diff)
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(start.getDate() + 7)
    return { gte: start, lt: end }
  }

  const start = new Date(base.getFullYear(), base.getMonth(), 1)
  // Grade começa na segunda da semana do dia 1 — puxa margem de 7 dias antes/depois
  const day = start.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const gte = new Date(start)
  gte.setDate(start.getDate() + diff)
  gte.setHours(0, 0, 0, 0)
  const lt = new Date(gte)
  lt.setDate(gte.getDate() + 42)
  return { gte, lt }
}
