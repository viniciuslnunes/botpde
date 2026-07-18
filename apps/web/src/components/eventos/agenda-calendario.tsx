'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Bus, CalendarDays, ChevronLeft, ChevronRight, Clock, Drum, MapPin } from 'lucide-react'
import type { TipoEvento } from '@torcida/db'
import { TIPO_EVENTO_LABEL } from '@torcida/types'

export type AgendaCalItem = {
  id: string
  titulo: string
  tipo: TipoEvento | string
  dataIso: string
  href: string
  fotoUrl?: string | null
  local?: string | null
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

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function horaLabel(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso),
  )
}

const DIA_LABEL = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

const TIPO_TINT: Record<string, string> = {
  GERAL: 'border-l-[rgb(var(--primary))] bg-[rgb(var(--primary)_/_0.08)]',
  CARAVANA: 'border-l-amber-500 bg-amber-500/10',
  ENSAIO: 'border-l-sky-500 bg-sky-500/10',
}

const TIPO_TEXT: Record<string, string> = {
  GERAL: 'text-[rgb(var(--primary))]',
  CARAVANA: 'text-amber-700 dark:text-amber-300',
  ENSAIO: 'text-sky-700 dark:text-sky-300',
}

const TIPO_DOT: Record<string, string> = {
  GERAL: 'bg-[rgb(var(--primary))]',
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
      prefetch
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
            {horaLabel(e.dataIso)}
          </span>
        </div>
        <h3 className="mt-0.5 line-clamp-2 text-sm font-semibold leading-snug text-[rgb(var(--foreground))] group-hover:text-[rgb(var(--primary))]">
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
      prefetch
      title={e.titulo}
      className="flex items-center gap-1 truncate rounded-md bg-[rgb(var(--surface))] px-1 py-0.5 text-[10px] font-medium text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))]"
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TIPO_DOT[tipo]}`} />
      <span className="truncate">{horaLabel(e.dataIso)} {e.titulo}</span>
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
  const [diaSelecionado, setDiaSelecionado] = useState(() => {
    const base = dataRefIso ? new Date(dataRefIso) : new Date()
    return startOfWeek(base)
  })

  const weekStart = useMemo(() => startOfWeek(cursor), [cursor])
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  )

  const monthDays = useMemo(() => {
    const start = startOfMonth(cursor)
    const gridStart = startOfWeek(start)
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  }, [cursor])

  const byDay = useMemo(() => {
    const map = new Map<string, AgendaCalItem[]>()
    for (const item of itens) {
      const d = new Date(item.dataIso)
      const key = dayKey(d)
      const list = map.get(key) ?? []
      list.push(item)
      map.set(key, list)
    }
    for (const [, list] of map) {
      list.sort((a, b) => new Date(a.dataIso).getTime() - new Date(b.dataIso).getTime())
    }
    return map
  }, [itens])

  // Mantém dia selecionado dentro da semana visível
  const diaAtivo = useMemo(() => {
    const inWeek = weekDays.some((d) => sameDay(d, diaSelecionado))
    if (inWeek) return diaSelecionado
    const hoje = new Date()
    const hojeNaSemana = weekDays.find((d) => sameDay(d, hoje))
    return hojeNaSemana ?? weekDays[0]!
  }, [weekDays, diaSelecionado])

  const eventosDoDia = byDay.get(dayKey(diaAtivo)) ?? []

  function nav(delta: number) {
    setCursor((c) => {
      const n = new Date(c)
      if (vista === 'semana') n.setDate(n.getDate() + delta * 7)
      else n.setMonth(n.getMonth() + delta)
      return n
    })
    if (vista === 'semana') {
      setDiaSelecionado((d) => addDays(d, delta * 7))
    }
  }

  const mesTitulo = cursor.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  function hrefComData(d: Date) {
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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
              {cursor.getFullYear()}
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
              const key = dayKey(day)
              const count = byDay.get(key)?.length ?? 0
              const ativo = sameDay(day, diaAtivo)
              const hoje = sameDay(day, new Date())
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setDiaSelecionado(day)}
                  className={[
                    'flex flex-col items-center rounded-2xl px-1 py-2.5 transition-colors sm:py-3',
                    ativo
                      ? 'bg-[rgb(var(--primary))] text-white shadow-md'
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
                    {day.getDate()}
                  </span>
                  <span
                    className={[
                      'mt-1 h-1.5 w-1.5 rounded-full',
                      count === 0
                        ? 'bg-transparent'
                        : ativo
                          ? 'bg-white'
                          : hoje
                            ? 'bg-[rgb(var(--primary))]'
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
              {diaAtivo.toLocaleDateString('pt-BR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
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
                className="mt-2 inline-block text-xs font-medium text-[rgb(var(--primary))] hover:underline"
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
            {cursor.getFullYear()}
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
          const key = dayKey(day)
          const events = byDay.get(key) ?? []
          const inMonth = day.getMonth() === cursor.getMonth()
          const hoje = sameDay(day, new Date())
          return (
            <div
              key={key}
              className={[
                'min-h-[72px] rounded-xl border p-1 sm:min-h-[84px] sm:p-1.5',
                inMonth
                  ? 'border-[rgb(var(--border))] bg-[rgb(var(--background-subtle)_/_0.35)]'
                  : 'border-transparent opacity-35',
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
