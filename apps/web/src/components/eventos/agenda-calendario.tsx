'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useRef, useState, useTransition } from 'react'
import { AnimatePresence, m } from 'motion/react'
import {
  Bus,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Drum,
  MapPin,
} from 'lucide-react'
import type { TipoEvento } from '@torcida/db'
import { TIPO_EVENTO_LABEL } from '@torcida/types'
import {
  addCalendarDays,
  calendarPartsToUtcNoon,
  dayKeyInZone,
  formatMonthYear,
  formatTimeShort,
  parseDateOnly,
  sameCalendarDay,
  startOfMonthParts,
  startOfWeekMonday,
  todayPartsInZone,
  zonedDateParts,
  type CalendarParts,
} from '@/lib/format-datetime'
import { fadeUp, springSnappy } from '@/lib/motion-presets'

export type AgendaCalItem = {
  id: string
  titulo: string
  tipo: TipoEvento | string
  dataIso: string
  href: string
  fotoUrl?: string | null
  local?: string | null
  partidaId?: string | null
}

export type AgendaCalPartida = {
  id: string
  dataIso: string
  adversario?: string | null
  mando?: string | null
}

const DIA_LABEL = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
/** Indexados por `Date#getUTCDay()` (0 = domingo). */
const DIA_CURTO = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const DIA_LONGO = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
]

const TIPOS = ['GERAL', 'CARAVANA', 'ENSAIO'] as const

const TIPO_TINT: Record<string, string> = {
  GERAL: 'border-l-[rgb(var(--color-primary-fg))] bg-[rgb(var(--color-primary)_/_0.08)]',
  CARAVANA: 'border-l-amber-500 bg-amber-500/10',
  ENSAIO: 'border-l-[rgb(var(--color-info))] bg-[rgb(var(--color-info)_/_0.1)]',
}

const TIPO_TEXT: Record<string, string> = {
  GERAL: 'text-[rgb(var(--color-primary-fg))]',
  CARAVANA: 'text-amber-700 dark:text-amber-300',
  ENSAIO: 'text-[rgb(var(--color-info-fg))]',
}

/** Marcador do dia — GERAL usa `primary-fg`: com marca P&B o `primary` cru some no dark. */
const TIPO_DOT: Record<string, string> = {
  GERAL: 'bg-[rgb(var(--color-primary-fg))]',
  CARAVANA: 'bg-amber-500',
  ENSAIO: 'bg-[rgb(var(--color-info))]',
}

const MAX_DOTS = 3
const MAX_RESTO_MES = 5

function TipoIcon({ tipo }: { tipo: string }) {
  const Icon = tipo === 'CARAVANA' ? Bus : tipo === 'ENSAIO' ? Drum : CalendarDays
  return <Icon className="h-4 w-4" />
}

function tipoKey(tipo: string): string {
  return tipo in TIPO_DOT ? tipo : 'GERAL'
}

function tipoLabel(tipo: string): string {
  return TIPO_EVENTO_LABEL[tipo as keyof typeof TIPO_EVENTO_LABEL] ?? tipo
}

function partsToIso(d: CalendarParts): string {
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`
}

function diaCurtoLabel(parts: CalendarParts): string {
  const weekday = calendarPartsToUtcNoon(parts).getUTCDay()
  return `${DIA_CURTO[weekday]} ${parts.day}`
}

function daysInMonth(parts: CalendarParts): number {
  return new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate()
}

function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}

function EventoDiaCard({ e }: { e: AgendaCalItem }) {
  const router = useRouter()
  const tipo = tipoKey(String(e.tipo))
  return (
    <Link
      href={e.href}
      prefetch={false}
      onMouseEnter={() => router.prefetch(e.href)}
      onFocus={() => router.prefetch(e.href)}
      className={cx(
        'group flex gap-3 overflow-hidden rounded-2xl border border-[rgb(var(--border))] border-l-4 bg-[rgb(var(--surface))] p-3 shadow-sm transition-all hover:shadow-md',
        TIPO_TINT[tipo],
      )}
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
            {tipoLabel(tipo)}
          </span>
          <span className="inline-flex items-center gap-1 text-xs font-semibold tabular-nums text-[rgb(var(--foreground))]">
            <Clock className="h-3 w-3 text-[rgb(var(--foreground-muted))]" />
            {formatTimeShort(e.dataIso)}
          </span>
        </div>
        <h3 className="portal-display mt-0.5 line-clamp-2 text-sm leading-snug text-[rgb(var(--foreground))] group-hover:text-[rgb(var(--color-primary-fg))]">
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

function EventoLinhaCompacta({ e }: { e: AgendaCalItem }) {
  const router = useRouter()
  const tipo = tipoKey(String(e.tipo))
  const parts = zonedDateParts(e.dataIso)
  return (
    <Link
      href={e.href}
      prefetch={false}
      onMouseEnter={() => router.prefetch(e.href)}
      className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-[rgb(var(--surface))]"
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TIPO_DOT[tipo]}`} aria-hidden />
      <span className="w-14 shrink-0 text-[11px] font-semibold uppercase tabular-nums tracking-wide text-[rgb(var(--foreground-muted))]">
        {diaCurtoLabel(parts)}
      </span>
      <span className="truncate text-xs text-[rgb(var(--foreground))]">{e.titulo}</span>
      <span className="ml-auto shrink-0 text-[11px] tabular-nums text-[rgb(var(--foreground-muted))]">
        {formatTimeShort(e.dataIso)}
      </span>
    </Link>
  )
}

function DiaDetalhe({
  dia,
  eventos,
  resto,
  restoLabel,
  proximoDia,
  onIrParaDia,
  onPrevDia,
  onNextDia,
  isHoje,
  onHoje,
}: {
  dia: CalendarParts
  eventos: AgendaCalItem[]
  resto: AgendaCalItem[]
  restoLabel: string
  proximoDia: CalendarParts | null
  onIrParaDia: (d: CalendarParts) => void
  onPrevDia?: () => void
  onNextDia?: () => void
  isHoje: boolean
  onHoje: () => void
}) {
  const weekday = calendarPartsToUtcNoon(dia).getUTCDay()
  const iconBtn =
    'app-touch-target inline-flex h-7 w-7 items-center justify-center rounded-lg text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--surface))] hover:text-[rgb(var(--foreground))]'

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-baseline gap-2.5">
          <span className="text-3xl font-bold leading-none tabular-nums text-[rgb(var(--foreground))]">
            {dia.day}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight text-[rgb(var(--foreground))] first-letter:uppercase">
              {DIA_LONGO[weekday]}
            </p>
            <p className="text-[11px] leading-tight text-[rgb(var(--foreground-muted))] first-letter:uppercase">
              {formatMonthYear(dia)}
            </p>
          </div>
          {isHoje && (
            <span className="rounded-md bg-[rgb(var(--color-primary)_/_0.14)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[rgb(var(--color-primary-fg))]">
              Hoje
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {!isHoje && (
            <button
              type="button"
              onClick={onHoje}
              className="mr-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-[rgb(var(--color-primary-fg))] transition-colors hover:bg-[rgb(var(--surface))]"
            >
              Hoje
            </button>
          )}
          {onPrevDia && (
            <button type="button" onClick={onPrevDia} className={iconBtn} aria-label="Dia anterior">
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
          {onNextDia && (
            <button type="button" onClick={onNextDia} className={iconBtn} aria-label="Dia seguinte">
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
        {eventos.length === 0
          ? 'Sem eventos'
          : `${eventos.length} compromisso${eventos.length > 1 ? 's' : ''}`}
      </p>

      <div className="mt-2 min-h-0 flex-1" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          <m.div
            key={partsToIso(dia)}
            variants={fadeUp}
            initial="hidden"
            animate="show"
            exit="hidden"
            transition={springSnappy}
          >
            {eventos.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[rgb(var(--border))] px-4 py-8 text-center">
                <CalendarDays
                  className="mx-auto h-7 w-7 text-[rgb(var(--foreground-muted)_/_0.5)]"
                  aria-hidden
                />
                <p className="mt-2 text-sm text-[rgb(var(--foreground-muted))]">
                  Nada marcado neste dia.
                </p>
                {proximoDia && (
                  <button
                    type="button"
                    onClick={() => onIrParaDia(proximoDia)}
                    className="app-touch-line mt-2 text-xs font-semibold text-[rgb(var(--color-primary-fg))] hover:underline"
                  >
                    Ir para o próximo evento
                  </button>
                )}
              </div>
            ) : (
              <ul className="space-y-2.5">
                {eventos.map((e) => (
                  <li key={e.id}>
                    <EventoDiaCard e={e} />
                  </li>
                ))}
              </ul>
            )}
          </m.div>
        </AnimatePresence>
      </div>

      {resto.length > 0 && (
        <div className="mt-4 border-t border-[rgb(var(--border))] pt-3">
          <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            {restoLabel}
          </p>
          <ul>
            {resto.map((e) => (
              <li key={e.id}>
                <EventoLinhaCompacta e={e} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/** Legenda que também conta — dispensa uma linha extra de resumo. */
function ResumoTipos({ contagem }: { contagem: Record<string, number> }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[11px] text-[rgb(var(--foreground-muted))]">
      {TIPOS.map((tipo) => (
        <li key={tipo} className="inline-flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${TIPO_DOT[tipo]}`} aria-hidden />
          <span className="font-semibold tabular-nums text-[rgb(var(--foreground))]">
            {contagem[tipo] ?? 0}
          </span>
          <span>{tipoLabel(tipo)}</span>
        </li>
      ))}
    </ul>
  )
}

function NavChrome({
  titulo,
  subtitulo,
  pending,
  onPrev,
  onNext,
  onHoje,
  prevLabel,
  nextLabel,
}: {
  titulo: string
  subtitulo: string
  pending: boolean
  onPrev: () => void
  onNext: () => void
  onHoje: () => void
  prevLabel: string
  nextLabel: string
}) {
  const btn =
    'app-touch-target inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[rgb(var(--border))] text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))] disabled:opacity-50'
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className={pending ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
        <h2 className="portal-display text-xl text-[rgb(var(--foreground))] sm:text-2xl">
          {titulo}
        </h2>
        <p className="portal-kicker mt-1 text-[rgb(var(--foreground-muted))]">{subtitulo}</p>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onPrev}
          className={btn}
          aria-label={prevLabel}
          disabled={pending}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onHoje}
          disabled={pending}
          className="app-touch-target h-9 rounded-xl border border-[rgb(var(--border))] px-3 text-xs font-semibold text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))] disabled:opacity-50"
        >
          Hoje
        </button>
        <button
          type="button"
          onClick={onNext}
          className={btn}
          aria-label={nextLabel}
          disabled={pending}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function resolveInitialParts(dataRefIso?: string): CalendarParts {
  return dataRefIso ? parseDateOnly(dataRefIso) : todayPartsInZone()
}

export function AgendaCalendario({
  vista,
  itens,
  partidas = [],
  dataRefIso,
  basePath,
  tipoFiltro,
  q,
}: {
  vista: 'semana' | 'mes'
  itens: AgendaCalItem[]
  /** Partidas na janela — badge “Jogo” nas células. */
  partidas?: AgendaCalPartida[]
  dataRefIso?: string
  basePath: string
  tipoFiltro?: string
  /** Busca ativa — preservada na navegação de mês/semana. */
  q?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const gridRef = useRef<HTMLDivElement>(null)

  const cursor = useMemo(() => resolveInitialParts(dataRefIso), [dataRefIso])
  // Estável por render — evita invalidar os memos que dependem de "hoje".
  const hoje = useMemo(() => todayPartsInZone(), [])

  const [diaSelecionado, setDiaSelecionado] = useState<CalendarParts>(() =>
    resolveInitialParts(dataRefIso),
  )

  const weekStart = useMemo(() => startOfWeekMonday(cursor), [cursor])
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addCalendarDays(weekStart, i)),
    [weekStart],
  )

  // Só as semanas que o mês realmente ocupa (5 ou 6) — sem linha morta no fim.
  const monthDays = useMemo(() => {
    const start = startOfMonthParts(cursor)
    const gridStart = startOfWeekMonday(start)
    const offset = Math.round(
      (calendarPartsToUtcNoon(start).getTime() - calendarPartsToUtcNoon(gridStart).getTime()) /
        86_400_000,
    )
    const semanas = Math.ceil((offset + daysInMonth(cursor)) / 7)
    return Array.from({ length: semanas * 7 }, (_, i) => addCalendarDays(gridStart, i))
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

  const jogoByDay = useMemo(() => {
    const map = new Map<string, AgendaCalPartida>()
    for (const p of partidas) {
      const key = dayKeyInZone(p.dataIso)
      if (!map.has(key)) map.set(key, p)
    }
    return map
  }, [partidas])

  /** Eventos do mês/semana visível, em ordem — base dos contadores e da lista "restante". */
  const itensNaJanela = useMemo(() => {
    const dias = vista === 'semana' ? weekDays : monthDays
    const keys = new Set(dias.filter((d) => vista === 'semana' || d.month === cursor.month).map(dayKeyInZone))
    return itens
      .filter((e) => keys.has(dayKeyInZone(e.dataIso)))
      .sort((a, b) => new Date(a.dataIso).getTime() - new Date(b.dataIso).getTime())
  }, [itens, vista, weekDays, monthDays, cursor.month])

  const contagemPorTipo = useMemo(() => {
    const acc: Record<string, number> = { GERAL: 0, CARAVANA: 0, ENSAIO: 0 }
    for (const e of itensNaJanela) acc[tipoKey(String(e.tipo))] += 1
    return acc
  }, [itensNaJanela])

  const primeiroDiaComEvento = useMemo(() => {
    const primeiro = itensNaJanela[0]
    return primeiro ? zonedDateParts(primeiro.dataIso) : null
  }, [itensNaJanela])

  /**
   * Dia ativo é derivado da janela: se a seleção ficou fora dela (troca de mês
   * pela URL), cai para hoje ou para o primeiro dia com evento — sem efeito.
   */
  const diaAtivo = useMemo(() => {
    const dentroDaJanela =
      vista === 'semana'
        ? weekDays.some((d) => sameCalendarDay(d, diaSelecionado))
        : diaSelecionado.year === cursor.year && diaSelecionado.month === cursor.month
    if (dentroDaJanela) return diaSelecionado

    const hojeNaJanela =
      vista === 'semana'
        ? weekDays.find((d) => sameCalendarDay(d, hoje))
        : hoje.year === cursor.year && hoje.month === cursor.month
          ? hoje
          : undefined
    if (hojeNaJanela && (byDay.get(dayKeyInZone(hojeNaJanela))?.length ?? 0) > 0) {
      return hojeNaJanela
    }
    if (primeiroDiaComEvento) return primeiroDiaComEvento
    return hojeNaJanela ?? (vista === 'semana' ? weekDays[0]! : startOfMonthParts(cursor))
  }, [vista, weekDays, diaSelecionado, cursor, hoje, byDay, primeiroDiaComEvento])

  const eventosDoDia = byDay.get(dayKeyInZone(diaAtivo)) ?? []

  /** Próximos da janela depois do dia ativo — mantém o painel útil quando o dia é vazio. */
  const restoDaJanela = useMemo(() => {
    const limite = calendarPartsToUtcNoon(diaAtivo).getTime()
    return itensNaJanela
      .filter((e) => calendarPartsToUtcNoon(zonedDateParts(e.dataIso)).getTime() > limite)
      .slice(0, MAX_RESTO_MES)
  }, [itensNaJanela, diaAtivo])

  const proximoDiaComEvento = useMemo(() => {
    const proximo = restoDaJanela[0] ?? itensNaJanela[0]
    return proximo ? zonedDateParts(proximo.dataIso) : null
  }, [restoDaJanela, itensNaJanela])

  const mesTitulo = formatMonthYear(cursor)
  const totalJanela = itensNaJanela.length

  function buildHref(parts: CalendarParts, opts?: { clearIfHoje?: boolean }) {
    const params = new URLSearchParams()
    // Sempre fixar a vista — portal defaulta em mês; admin defaulta em lista.
    params.set('vista', vista)
    if (!(opts?.clearIfHoje && sameCalendarDay(parts, hoje))) {
      params.set('data', partsToIso(parts))
    }
    if (tipoFiltro) params.set('tipo', tipoFiltro)
    const query = q?.trim()
    if (query) params.set('q', query)
    return `${basePath}?${params.toString()}`
  }

  function navigateTo(parts: CalendarParts, opts?: { clearIfHoje?: boolean }) {
    startTransition(() => {
      router.push(buildHref(parts, opts), { scroll: false })
    })
  }

  function nav(delta: number) {
    if (vista === 'semana') {
      setDiaSelecionado(addCalendarDays(diaAtivo, delta * 7))
      navigateTo(addCalendarDays(cursor, delta * 7))
      return
    }
    const monthIndex = cursor.month - 1 + delta
    const year = cursor.year + Math.floor(monthIndex / 12)
    const month = ((monthIndex % 12) + 12) % 12
    navigateTo({ year, month: month + 1, day: 1 })
  }

  function goHoje() {
    setDiaSelecionado(hoje)
    navigateTo(hoje, { clearIfHoje: true })
  }

  function focusDia(parts: CalendarParts) {
    const key = dayKeyInZone(parts)
    requestAnimationFrame(() => {
      gridRef.current?.querySelector<HTMLButtonElement>(`[data-dia="${key}"]`)?.focus()
    })
  }

  function selectDia(day: CalendarParts, opts?: { scrollPainel?: boolean }) {
    setDiaSelecionado(day)
    // Dentro do mês carregado: só estado local (instantâneo). Fora: nova janela via URL.
    if (vista === 'mes' && (day.month !== cursor.month || day.year !== cursor.year)) {
      navigateTo(day)
      return
    }
    if (
      opts?.scrollPainel &&
      typeof window !== 'undefined' &&
      window.matchMedia('(max-width: 1023px)').matches
    ) {
      requestAnimationFrame(() => {
        document
          .getElementById('agenda-dia-painel')
          ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      })
    }
  }

  /** Setas / PageUp / PageDown / T / Enter dentro da grade — sem sequestrar a busca. */
  function onGridKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.metaKey || event.ctrlKey || event.altKey) return
    const passo: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    }
    if (event.key in passo) {
      event.preventDefault()
      const proximo = addCalendarDays(diaAtivo, passo[event.key]!)
      selectDia(proximo)
      focusDia(proximo)
      return
    }
    if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault()
      nav(event.key === 'PageUp' ? -1 : 1)
      return
    }
    if (event.key === 't' || event.key === 'T' || event.key === 'Home') {
      event.preventDefault()
      goHoje()
      focusDia(hoje)
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      const primeiro = eventosDoDia[0]
      if (primeiro) {
        event.preventDefault()
        router.push(primeiro.href)
      }
    }
  }

  const painel = (
    <DiaDetalhe
      dia={diaAtivo}
      eventos={eventosDoDia}
      resto={restoDaJanela}
      restoLabel={vista === 'semana' ? 'No restante da semana' : 'No restante do mês'}
      proximoDia={proximoDiaComEvento}
      onIrParaDia={(d) => {
        selectDia(d)
        focusDia(d)
      }}
      onPrevDia={
        vista === 'mes'
          ? () => {
              const d = addCalendarDays(diaAtivo, -1)
              selectDia(d)
            }
          : undefined
      }
      onNextDia={
        vista === 'mes'
          ? () => {
              const d = addCalendarDays(diaAtivo, 1)
              selectDia(d)
            }
          : undefined
      }
      isHoje={sameCalendarDay(diaAtivo, hoje)}
      onHoje={goHoje}
    />
  )

  if (vista === 'semana') {
    return (
      <div className="overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface)_/_0.75)] shadow-sm backdrop-blur-md">
        <div className="border-b border-[rgb(var(--border))] px-4 py-4 sm:px-5">
          <NavChrome
            titulo={mesTitulo}
            subtitulo={
              totalJanela === 0
                ? 'Nenhum evento nesta semana'
                : `${totalJanela} evento${totalJanela > 1 ? 's' : ''} nesta semana`
            }
            pending={pending}
            onPrev={() => nav(-1)}
            onNext={() => nav(1)}
            onHoje={goHoje}
            prevLabel="Semana anterior"
            nextLabel="Próxima semana"
          />
        </div>

        <div className="border-b border-[rgb(var(--border))] px-3 py-3 sm:px-4">
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {weekDays.map((day, i) => {
              const key = dayKeyInZone(day)
              const count = byDay.get(key)?.length ?? 0
              const jogo = jogoByDay.get(key)
              const ativo = sameCalendarDay(day, diaAtivo)
              const isHoje = sameCalendarDay(day, hoje)
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setDiaSelecionado(day)}
                  aria-pressed={ativo}
                  aria-current={isHoje ? 'date' : undefined}
                  aria-label={`${DIA_LABEL[i]} ${day.day}${jogo ? ', jogo' : ''}${count ? `, ${count} eventos` : ', sem eventos'}`}
                  className={cx(
                    'flex flex-col items-center rounded-2xl px-1 py-2.5 transition-colors sm:py-3',
                    ativo
                      ? 'bg-[rgb(var(--color-primary))] text-[rgb(var(--color-primary-on))] shadow-md'
                      : 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground))] hover:bg-[rgb(var(--border)_/_0.55)]',
                  )}
                >
                  <span
                    className={cx(
                      'text-[10px] font-semibold uppercase tracking-wide',
                      ativo
                        ? 'text-[rgb(var(--color-primary-on)_/_0.8)]'
                        : 'text-[rgb(var(--foreground-muted))]',
                    )}
                  >
                    {DIA_LABEL[i]}
                  </span>
                  <span className="mt-0.5 text-lg font-bold tabular-nums sm:text-xl">
                    {day.day}
                  </span>
                  {jogo ? (
                    <span
                      className={cx(
                        'mt-1 rounded px-1 text-[8px] font-bold uppercase tracking-wide',
                        ativo
                          ? 'bg-[rgb(var(--color-primary-on)_/_0.2)] text-[rgb(var(--color-primary-on))]'
                          : 'bg-[rgb(var(--color-success)_/_0.15)] text-[rgb(var(--color-success-fg))]',
                      )}
                    >
                      Jogo
                    </span>
                  ) : (
                    <span
                      className={cx(
                        'mt-1 h-1.5 w-1.5 rounded-full',
                        count === 0
                          ? 'bg-transparent'
                          : ativo
                            ? 'bg-[rgb(var(--color-primary-on))]'
                            : isHoje
                              ? 'bg-[rgb(var(--color-primary-fg))]'
                              : 'bg-[rgb(var(--foreground-muted))]',
                      )}
                      aria-hidden
                    />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        <div className="p-4 sm:p-5">{painel}</div>
      </div>
    )
  }

  // Mês — grade de varredura + painel do dia
  return (
    <div className="overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface)_/_0.75)] shadow-sm backdrop-blur-md">
      <div className="border-b border-[rgb(var(--border))] px-4 py-4 sm:px-5">
        <NavChrome
          titulo={mesTitulo}
          subtitulo={
            totalJanela === 0
              ? 'Nenhum evento neste mês'
              : `${totalJanela} evento${totalJanela > 1 ? 's' : ''} neste mês`
          }
          pending={pending}
          onPrev={() => nav(-1)}
          onNext={() => nav(1)}
          onHoje={goHoje}
          prevLabel="Mês anterior"
          nextLabel="Próximo mês"
        />
      </div>

      <div className="lg:grid lg:grid-cols-12 lg:items-stretch">
        <div className="p-3 sm:p-4 lg:col-span-7 lg:border-r lg:border-[rgb(var(--border))] xl:col-span-8">
          <div className="overflow-hidden rounded-xl border border-[rgb(var(--border))]">
            <div className="grid grid-cols-7 border-b border-[rgb(var(--border))] bg-[rgb(var(--background-subtle)_/_0.6)]">
              {DIA_LABEL.map((d) => (
                <div
                  key={d}
                  className="py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]"
                >
                  {d}
                </div>
              ))}
            </div>

            <div
              ref={gridRef}
              onKeyDown={onGridKeyDown}
              className="grid grid-cols-7 bg-[rgb(var(--surface)_/_0.4)]"
            >
              {monthDays.map((day, i) => {
                const key = dayKeyInZone(day)
                const events = byDay.get(key) ?? []
                const inMonth = day.month === cursor.month
                const isHoje = sameCalendarDay(day, hoje)
                const ativo = sameCalendarDay(day, diaAtivo)
                const dots = events.slice(0, MAX_DOTS)
                const overflow = events.length - dots.length
                const ultimaLinha = i >= monthDays.length - 7

                return (
                  <button
                    key={key}
                    type="button"
                    data-dia={key}
                    tabIndex={ativo ? 0 : -1}
                    onClick={() => selectDia(day, { scrollPainel: true })}
                    aria-pressed={ativo}
                    aria-current={isHoje ? 'date' : undefined}
                    aria-label={`${day.day} de ${formatMonthYear(day)}${
                      events.length
                        ? `, ${events.length} evento${events.length > 1 ? 's' : ''}`
                        : ', sem eventos'
                    }`}
                    title={
                      events.length
                        ? events.map((e) => `${formatTimeShort(e.dataIso)} · ${e.titulo}`).join('\n')
                        : undefined
                    }
                    className={cx(
                      'relative flex min-h-[68px] flex-col items-start gap-1 p-1.5 text-left transition-colors sm:min-h-[84px] sm:p-2',
                      'focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[rgb(var(--color-primary-fg))]',
                      i % 7 !== 6 && 'border-r border-[rgb(var(--border)_/_0.7)]',
                      !ultimaLinha && 'border-b border-[rgb(var(--border)_/_0.7)]',
                      inMonth
                        ? 'hover:bg-[rgb(var(--background-subtle)_/_0.7)]'
                        : 'bg-[rgb(var(--background-subtle)_/_0.25)]',
                      ativo && 'bg-[rgb(var(--color-primary)_/_0.12)]',
                    )}
                  >
                    <span
                      className={cx(
                        'inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-semibold tabular-nums sm:text-sm',
                        isHoje && 'bg-[rgb(var(--color-primary))] text-[rgb(var(--color-primary-on))]',
                        !isHoje && ativo && 'font-bold text-[rgb(var(--foreground))]',
                        !isHoje && !ativo && inMonth && 'text-[rgb(var(--foreground))]',
                        !isHoje && !ativo && !inMonth && 'text-[rgb(var(--foreground-muted)_/_0.6)]',
                      )}
                    >
                      {day.day}
                    </span>

                    {events.length > 0 && (
                      <span
                        className={cx(
                          'mt-auto flex flex-wrap items-center gap-1',
                          !inMonth && 'opacity-50',
                        )}
                      >
                        {dots.map((e) => (
                          <span
                            key={e.id}
                            className={`h-1.5 w-1.5 rounded-full ${TIPO_DOT[tipoKey(String(e.tipo))]}`}
                            aria-hidden
                          />
                        ))}
                        {overflow > 0 && (
                          <span className="text-[10px] font-semibold leading-none tabular-nums text-[rgb(var(--foreground-muted))]">
                            +{overflow}
                          </span>
                        )}
                      </span>
                    )}

                    {ativo && (
                      <span
                        className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-[rgb(var(--color-primary-fg)_/_0.6)]"
                        aria-hidden
                      />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <ResumoTipos contagem={contagemPorTipo} />
            <p className="hidden text-[11px] text-[rgb(var(--foreground-muted))] lg:block">
              Setas navegam · T volta para hoje
            </p>
          </div>
        </div>

        <aside
          id="agenda-dia-painel"
          className="border-t border-[rgb(var(--border))] bg-[rgb(var(--background-subtle)_/_0.25)] p-4 sm:p-5 lg:col-span-5 lg:border-t-0 xl:col-span-4"
        >
          {painel}
        </aside>
      </div>
    </div>
  )
}
