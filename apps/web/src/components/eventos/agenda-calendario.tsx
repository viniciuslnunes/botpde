'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Bus, CalendarDays, ChevronLeft, ChevronRight, Clock, Drum, MapPin } from 'lucide-react'
import type { TipoEvento } from '@torcida/db'
import { TIPO_EVENTO_LABEL } from '@torcida/types'
import {
  addCalendarDays,
  dayKeyInZone,
  formatMonthYear,
  formatTimeShort,
  formatWeekdayLong,
  parseDateOnly,
  sameCalendarDay,
  startOfMonthParts,
  startOfWeekMonday,
  todayPartsInZone,
  type CalendarParts,
} from '@/lib/format-datetime'

export type AgendaCalItem = {
  id: string
  titulo: string
  tipo: TipoEvento | string
  dataIso: string
  href: string
  fotoUrl?: string | null
  local?: string | null
}

const DIA_LABEL = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

const TIPO_TINT: Record<string, string> = {
  GERAL: 'border-l-[rgb(var(--color-primary))] bg-[rgb(var(--color-primary)_/_0.08)]',
  CARAVANA: 'border-l-amber-500 bg-amber-500/10',
  ENSAIO: 'border-l-sky-500 bg-sky-500/10',
}

const TIPO_TEXT: Record<string, string> = {
  GERAL: 'text-[rgb(var(--color-primary-fg))]',
  CARAVANA: 'text-amber-700 dark:text-amber-300',
  ENSAIO: 'text-sky-700 dark:text-sky-300',
}

const TIPO_DOT: Record<string, string> = {
  GERAL: 'bg-[rgb(var(--color-primary))]',
  CARAVANA: 'bg-amber-500',
  ENSAIO: 'bg-sky-500',
}

function TipoIcon({ tipo }: { tipo: string }) {
  const Icon = tipo === 'CARAVANA' ? Bus : tipo === 'ENSAIO' ? Drum : CalendarDays
  return <Icon className="h-4 w-4" />
}

function EventoDiaCard({ e }: { e: AgendaCalItem }) {
  const tipo = e.tipo in TIPO_TINT ? String(e.tipo) : 'GERAL'
  return (
    <Link
      href={e.href}
      prefetch={false}
      className={[
        'group flex gap-3 overflow-hidden rounded-2xl border border-[rgb(var(--border))] border-l-4 bg-[rgb(var(--surface))] p-3 shadow-sm transition-all hover:shadow-md',
        TIPO_TINT[tipo],
      ].join(' ')}
    >
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[rgb(var(--background-subtle))] sm:h-[4.5rem] sm:w-[4.5rem]">
        {e.fotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={e.fotoUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div
            className={`flex h-full w-full items-center justify-center ${TIPO_TEXT[tipo]}`}
            aria-hidden
          >
            <TipoIcon tipo={tipo} />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-[11px] font-bold uppercase tracking-wide ${TIPO_TEXT[tipo]}`}>
            {TIPO_EVENTO_LABEL[tipo as keyof typeof TIPO_EVENTO_LABEL] ?? tipo}
          </span>
          <span className="inline-flex items-center gap-1 text-xs font-semibold tabular-nums text-[rgb(var(--foreground))]">
            <Clock className="h-3 w-3 text-[rgb(var(--foreground-muted))]" />
            {formatTimeShort(e.dataIso)}
          </span>
        </div>
        <h3 className="mt-0.5 line-clamp-2 text-sm font-semibold leading-snug text-[rgb(var(--foreground))] group-hover:text-[rgb(var(--color-primary-fg))]">
          {e.titulo}
        </h3>
        {e.local && (
          <p className="mt-1 flex items-center gap-1 truncate text-xs text-[rgb(var(--foreground-muted))]">
            <MapPin className="h-3 w-3 shrink-0" />
            {e.local}
          </p>
        )}
      </div>
    </Link>
  )
}

function MesChip({ e }: { e: AgendaCalItem }) {
  const tipo = e.tipo in TIPO_DOT ? String(e.tipo) : 'GERAL'
  return (
    <Link
      href={e.href}
      prefetch={false}
      title={e.titulo}
      className="flex items-center gap-1 truncate rounded-md bg-[rgb(var(--surface))] px-1 py-0.5 text-[10px] font-medium text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))]"
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TIPO_DOT[tipo]}`} />
      <span className="truncate">
        {formatTimeShort(e.dataIso)} {e.titulo}
      </span>
    </Link>
  )
}

function resolveInitialParts(dataRefIso?: string): CalendarParts {
  return dataRefIso ? parseDateOnly(dataRefIso) : todayPartsInZone()
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
  const [cursor, setCursor] = useState(() => resolveInitialParts(dataRefIso))
  const [diaSelecionado, setDiaSelecionado] = useState(() =>
    startOfWeekMonday(resolveInitialParts(dataRefIso)),
  )

  const weekStart = useMemo(() => startOfWeekMonday(cursor), [cursor])
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addCalendarDays(weekStart, i)),
    [weekStart],
  )

  const monthDays = useMemo(() => {
    const start = startOfMonthParts(cursor)
    const gridStart = startOfWeekMonday(start)
    return Array.from({ length: 42 }, (_, i) => addCalendarDays(gridStart, i))
  }, [cursor])

  const byDay = useMemo(() => {
    const map = new Map<string, AgendaCalItem[]>()
    for (const item of itens) {
      const key = dayKeyInZone(item.dataIso)
      const list = map.get(key) ?? []
      list.push(item)
      map.set(key, list)
    }
    for (const [, list] of map) {
      list.sort((a, b) => new Date(a.dataIso).getTime() - new Date(b.dataIso).getTime())
    }
    return map
  }, [itens])

  const hoje = todayPartsInZone()
  const hojeKey = dayKeyInZone(hoje)

  // Mantém dia selecionado dentro da semana visível
  const diaAtivo = useMemo(() => {
    const inWeek = weekDays.some((d) => sameCalendarDay(d, diaSelecionado))
    if (inWeek) return diaSelecionado
    const hojeParts = todayPartsInZone()
    const hojeNaSemana = weekDays.find((d) => sameCalendarDay(d, hojeParts))
    return hojeNaSemana ?? weekDays[0]!
  }, [weekDays, diaSelecionado, hojeKey])

  const eventosDoDia = byDay.get(dayKeyInZone(diaAtivo)) ?? []

  function nav(delta: number) {
    setCursor((c) => {
      if (vista === 'semana') return addCalendarDays(c, delta * 7)
      const monthIndex = c.month - 1 + delta
      const year = c.year + Math.floor(monthIndex / 12)
      const month = ((monthIndex % 12) + 12) % 12
      return { year, month: month + 1, day: 1 }
    })
    if (vista === 'semana') {
      setDiaSelecionado((d) => addCalendarDays(d, delta * 7))
    }
  }

  const mesTitulo = formatMonthYear(cursor)

  function hrefComData(d: CalendarParts) {
    const iso = `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`
    const params = new URLSearchParams()
    params.set('vista', vista)
    params.set('data', iso)
    if (tipoFiltro) params.set('tipo', tipoFiltro)
    return `${basePath}?${params.toString()}`
  }

  if (vista === 'semana') {
    return (
      <div className="overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface)_/_0.75)] shadow-sm backdrop-blur-md">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[rgb(var(--border))] px-4 py-4 sm:px-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
              {cursor.year}
            </p>
            <h2 className="text-2xl font-bold capitalize tracking-tight text-[rgb(var(--foreground))]">
              {mesTitulo}
            </h2>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => nav(-1)}
              className="rounded-full border border-[rgb(var(--border))] p-2 text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
              aria-label="Semana anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => nav(1)}
              className="rounded-full border border-[rgb(var(--border))] p-2 text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
              aria-label="Próxima semana"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="border-b border-[rgb(var(--border))] px-3 py-3 sm:px-4">
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {weekDays.map((day, i) => {
              const key = dayKeyInZone(day)
              const count = byDay.get(key)?.length ?? 0
              const ativo = sameCalendarDay(day, diaAtivo)
              const isHoje = sameCalendarDay(day, hoje)
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setDiaSelecionado(day)}
                  className={[
                    'flex flex-col items-center rounded-2xl px-1 py-2.5 transition-colors sm:py-3',
                    ativo
                      ? 'bg-[rgb(var(--color-primary))] text-[rgb(var(--color-primary-on))] shadow-md'
                      : 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground))] hover:bg-[rgb(var(--border)_/_0.55)]',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'text-[10px] font-semibold uppercase tracking-wide',
                      ativo ? 'text-white/80' : 'text-[rgb(var(--foreground-muted))]',
                    ].join(' ')}
                  >
                    {DIA_LABEL[i]}
                  </span>
                  <span className="mt-0.5 text-lg font-bold tabular-nums sm:text-xl">
                    {day.day}
                  </span>
                  <span
                    className={[
                      'mt-1 h-1.5 w-1.5 rounded-full',
                      count === 0
                        ? 'bg-transparent'
                        : ativo
                          ? 'bg-white'
                          : isHoje
                            ? 'bg-[rgb(var(--color-primary))]'
                            : 'bg-[rgb(var(--foreground-muted))]',
                    ].join(' ')}
                    aria-hidden
                  />
                </button>
              )
            })}
          </div>
        </div>

        <div className="space-y-3 p-4 sm:p-5">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold capitalize text-[rgb(var(--foreground))]">
              {formatWeekdayLong(diaAtivo)}
            </h3>
            <p className="text-xs tabular-nums text-[rgb(var(--foreground-muted))]">
              {eventosDoDia.length === 0
                ? 'Sem eventos'
                : `${eventosDoDia.length} compromisso${eventosDoDia.length > 1 ? 's' : ''}`}
            </p>
          </div>

          {eventosDoDia.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[rgb(var(--border))] px-4 py-10 text-center">
              <p className="text-sm text-[rgb(var(--foreground-muted))]">
                Nada marcado neste dia.
              </p>
              <Link
                href={hrefComData(diaAtivo)}
                prefetch={false}
                className="mt-2 inline-block text-xs font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
              >
                Ver no filtro de data
              </Link>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {eventosDoDia.map((e) => (
                <li key={e.id}>
                  <EventoDiaCard e={e} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    )
  }

  // Mês
  return (
    <div className="overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface)_/_0.75)] p-3 shadow-sm backdrop-blur-md sm:p-4">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            {cursor.year}
          </p>
          <h2 className="text-xl font-bold capitalize tracking-tight text-[rgb(var(--foreground))] sm:text-2xl">
            {mesTitulo}
          </h2>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => nav(-1)}
            className="rounded-full border border-[rgb(var(--border))] p-2 text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
            aria-label="Mês anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => nav(1)}
            className="rounded-full border border-[rgb(var(--border))] p-2 text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
            aria-label="Próximo mês"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
        {DIA_LABEL.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {monthDays.map((day) => {
          const key = dayKeyInZone(day)
          const events = byDay.get(key) ?? []
          const inMonth = day.month === cursor.month
          const isHoje = sameCalendarDay(day, hoje)
          return (
            <div
              key={key}
              className={[
                'min-h-[72px] rounded-xl border p-1 sm:min-h-[84px] sm:p-1.5',
                inMonth
                  ? 'border-[rgb(var(--border))] bg-[rgb(var(--background-subtle)_/_0.35)]'
                  : 'border-transparent opacity-35',
                isHoje ? 'ring-1 ring-[rgb(var(--color-primary))]' : '',
              ].join(' ')}
            >
              <Link
                href={hrefComData(day)}
                prefetch={false}
                className={[
                  'mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold',
                  isHoje
                    ? 'bg-[rgb(var(--color-primary))] text-[rgb(var(--color-primary-on))]'
                    : 'text-[rgb(var(--foreground-muted))]',
                ].join(' ')}
              >
                {day.day}
              </Link>
              <ul className="space-y-0.5">
                {events.slice(0, 2).map((e) => (
                  <li key={e.id}>
                    <MesChip e={e} />
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
    </div>
  )
}
