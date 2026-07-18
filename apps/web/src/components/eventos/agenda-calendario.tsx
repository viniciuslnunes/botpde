'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { TipoEvento } from '@torcida/db'
import { TIPO_EVENTO_LABEL } from '@torcida/types'

export type AgendaCalItem = {
  id: string
  titulo: string
  tipo: TipoEvento | string
  dataIso: string
  href: string
}

function startOfWeek(d: Date) {
  const x = new Date(d)
  const day = x.getDay()
  const diff = day === 0 ? -6 : 1 - day
  x.setDate(x.getDate() + diff)
  x.setHours(0, 0, 0, 0)
  return x
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function addDays(d: Date, n: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

function horaLabel(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso),
  )
}

const DIA_LABEL = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

const TIPO_CHIP: Record<string, string> = {
  GERAL: 'bg-[rgb(var(--primary)_/_0.14)] text-[rgb(var(--primary))]',
  CARAVANA: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  ENSAIO: 'bg-sky-500/15 text-sky-800 dark:text-sky-300',
}

const TIPO_BAR: Record<string, string> = {
  GERAL: 'bg-[rgb(var(--primary))]',
  CARAVANA: 'bg-amber-500',
  ENSAIO: 'bg-sky-500',
}

function EventoChip({ e, dense }: { e: AgendaCalItem; dense?: boolean }) {
  const tipo = e.tipo in TIPO_CHIP ? e.tipo : 'GERAL'
  return (
    <Link
      href={e.href}
      prefetch
      title={e.titulo}
      className={[
        'block overflow-hidden rounded-xl border border-[rgb(var(--border)_/_0.8)] bg-[rgb(var(--surface))] shadow-sm transition-colors hover:border-[rgb(var(--primary)_/_0.45)]',
        dense ? 'p-1.5' : 'p-2',
      ].join(' ')}
    >
      <div className="flex gap-1.5">
        <span className={`mt-0.5 w-1 shrink-0 self-stretch rounded-full ${TIPO_BAR[tipo]}`} />
        <div className="min-w-0 flex-1">
          <p
            className={[
              'font-semibold leading-snug text-[rgb(var(--foreground))]',
              dense ? 'line-clamp-1 text-[10px]' : 'line-clamp-2 text-[11px]',
            ].join(' ')}
          >
            {e.titulo}
          </p>
          <p
            className={[
              'mt-0.5 font-medium',
              TIPO_CHIP[tipo],
              dense ? 'text-[9px]' : 'text-[10px]',
            ].join(' ')}
          >
            {TIPO_EVENTO_LABEL[tipo as keyof typeof TIPO_EVENTO_LABEL] ?? tipo}
            <span className="text-[rgb(var(--foreground-muted))]"> · {horaLabel(e.dataIso)}</span>
          </p>
        </div>
      </div>
    </Link>
  )
}

export function AgendaCalendario({
  vista,
  itens,
  dataRefIso,
  basePath,
  tipoFiltro,
}: {
  vista: 'semana' | 'mes'
  itens: AgendaCalItem[]
  dataRefIso?: string
  basePath: string
  tipoFiltro?: string
}) {
  const initial = dataRefIso ? new Date(dataRefIso) : new Date()
  const [cursor, setCursor] = useState(initial)

  const days = useMemo(() => {
    if (vista === 'semana') {
      const start = startOfWeek(cursor)
      return Array.from({ length: 7 }, (_, i) => addDays(start, i))
    }
    const start = startOfMonth(cursor)
    const gridStart = startOfWeek(start)
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  }, [cursor, vista])

  const byDay = useMemo(() => {
    const map = new Map<string, AgendaCalItem[]>()
    for (const item of itens) {
      const d = new Date(item.dataIso)
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      const list = map.get(key) ?? []
      list.push(item)
      map.set(key, list)
    }
    for (const [, list] of map) {
      list.sort((a, b) => new Date(a.dataIso).getTime() - new Date(b.dataIso).getTime())
    }
    return map
  }, [itens])

  function nav(delta: number) {
    setCursor((c) => {
      const n = new Date(c)
      if (vista === 'semana') n.setDate(n.getDate() + delta * 7)
      else n.setMonth(n.getMonth() + delta)
      return n
    })
  }

  const mesTitulo = cursor.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const semanaTitulo = `${days[0]?.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} – ${days[6]?.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`

  function hrefComData(d: Date) {
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const params = new URLSearchParams()
    params.set('vista', vista)
    params.set('data', iso)
    if (tipoFiltro) params.set('tipo', tipoFiltro)
    return `${basePath}?${params.toString()}`
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface)_/_0.72)] p-3 shadow-sm backdrop-blur-md sm:p-4">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            {cursor.getFullYear()}
          </p>
          <h2 className="text-xl font-bold capitalize tracking-tight text-[rgb(var(--foreground))] sm:text-2xl">
            {vista === 'semana' ? semanaTitulo : mesTitulo}
          </h2>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => nav(-1)}
            className="rounded-full border border-[rgb(var(--border))] p-2 text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
            aria-label="Anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => nav(1)}
            className="rounded-full border border-[rgb(var(--border))] p-2 text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
            aria-label="Próximo"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-3 text-[10px] text-[rgb(var(--foreground-muted))]">
        <span className="inline-flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${TIPO_BAR.GERAL}`} /> Evento
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${TIPO_BAR.CARAVANA}`} /> Caravana
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${TIPO_BAR.ENSAIO}`} /> Ensaio
        </span>
      </div>

      {vista === 'semana' ? (
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <div className="grid min-w-[640px] grid-cols-7 gap-2">
            {days.map((day, i) => {
              const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`
              const events = byDay.get(key) ?? []
              const hoje = sameDay(day, new Date())
              return (
                <div
                  key={key}
                  className={[
                    'flex min-h-[280px] flex-col rounded-2xl border p-2',
                    hoje
                      ? 'border-[rgb(var(--primary)_/_0.45)] bg-[rgb(var(--primary)_/_0.06)]'
                      : 'border-[rgb(var(--border))] bg-[rgb(var(--background-subtle)_/_0.45)]',
                  ].join(' ')}
                >
                  <Link href={hrefComData(day)} className="mb-2 block text-center">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                      {DIA_LABEL[i]}
                    </p>
                    <p
                      className={[
                        'mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold',
                        hoje
                          ? 'bg-[rgb(var(--primary))] text-white'
                          : 'text-[rgb(var(--foreground))]',
                      ].join(' ')}
                    >
                      {day.getDate()}
                    </p>
                  </Link>
                  <ul className="flex flex-1 flex-col gap-1.5">
                    {events.slice(0, 5).map((e) => (
                      <li key={e.id}>
                        <EventoChip e={e} />
                      </li>
                    ))}
                    {events.length === 0 && (
                      <li className="py-6 text-center text-[10px] text-[rgb(var(--foreground-muted))]">
                        —
                      </li>
                    )}
                    {events.length > 5 && (
                      <li className="text-center text-[10px] text-[rgb(var(--foreground-muted))]">
                        +{events.length - 5}
                      </li>
                    )}
                  </ul>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <>
          <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            {DIA_LABEL.map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
            {days.map((day) => {
              const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`
              const events = byDay.get(key) ?? []
              const inMonth = day.getMonth() === cursor.getMonth()
              const hoje = sameDay(day, new Date())
              return (
                <div
                  key={key}
                  className={[
                    'min-h-[88px] rounded-xl border p-1 sm:min-h-[100px] sm:p-1.5',
                    inMonth
                      ? 'border-[rgb(var(--border))] bg-[rgb(var(--background-subtle)_/_0.4)]'
                      : 'border-transparent opacity-40',
                    hoje ? 'ring-1 ring-[rgb(var(--primary))]' : '',
                  ].join(' ')}
                >
                  <Link
                    href={hrefComData(day)}
                    className={[
                      'mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold',
                      hoje
                        ? 'bg-[rgb(var(--primary))] text-white'
                        : 'text-[rgb(var(--foreground-muted))]',
                    ].join(' ')}
                  >
                    {day.getDate()}
                  </Link>
                  <ul className="space-y-1">
                    {events.slice(0, 2).map((e) => (
                      <li key={e.id}>
                        <EventoChip e={e} dense />
                      </li>
                    ))}
                    {events.length > 2 && (
                      <li className="px-0.5 text-[9px] text-[rgb(var(--foreground-muted))]">
                        +{events.length - 2}
                      </li>
                    )}
                  </ul>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
