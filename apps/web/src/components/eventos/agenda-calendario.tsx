'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { TipoEvento } from '@torcida/db'

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

const DIA_LABEL = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

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

  const titulo =
    vista === 'semana'
      ? `Semana de ${days[0]?.toLocaleDateString('pt-BR')}`
      : cursor.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  function hrefComData(d: Date) {
    const iso = d.toISOString().slice(0, 10)
    const params = new URLSearchParams()
    params.set('vista', vista)
    params.set('data', iso)
    if (tipoFiltro) params.set('tipo', tipoFiltro)
    return `${basePath}?${params.toString()}`
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => nav(-1)}
          className="rounded-lg border border-[rgb(var(--border))] p-1.5 text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
          aria-label="Anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-sm font-semibold capitalize text-[rgb(var(--foreground))]">{titulo}</p>
        <button
          type="button"
          onClick={() => nav(1)}
          className="rounded-lg border border-[rgb(var(--border))] p-1.5 text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
          aria-label="Próximo"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase text-[rgb(var(--foreground-muted))]">
        {DIA_LABEL.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`
          const events = byDay.get(key) ?? []
          const inMonth = vista === 'semana' || day.getMonth() === cursor.getMonth()
          const hoje = sameDay(day, new Date())
          return (
            <div
              key={key}
              className={[
                'min-h-[72px] rounded-lg border p-1 text-left',
                inMonth
                  ? 'border-[rgb(var(--border))] bg-[rgb(var(--surface))]'
                  : 'border-transparent bg-[rgb(var(--background-subtle))] opacity-50',
                hoje ? 'ring-1 ring-[rgb(var(--primary))]' : '',
              ].join(' ')}
            >
              <Link
                href={hrefComData(day)}
                className="mb-1 block text-[11px] font-medium text-[rgb(var(--foreground-muted))]"
              >
                {day.getDate()}
              </Link>
              <ul className="space-y-0.5">
                {events.slice(0, vista === 'mes' ? 2 : 4).map((e) => (
                  <li key={e.id}>
                    <Link
                      href={e.href}
                      className="block truncate rounded px-0.5 text-[10px] font-medium text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))]"
                      title={`${e.tipo}: ${e.titulo}`}
                    >
                      {e.titulo}
                    </Link>
                  </li>
                ))}
                {events.length > (vista === 'mes' ? 2 : 4) && (
                  <li className="text-[10px] text-[rgb(var(--foreground-muted))]">
                    +{events.length - (vista === 'mes' ? 2 : 4)}
                  </li>
                )}
              </ul>
            </div>
          )
        })}
      </div>
    </div>
  )
}
