'use client'

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, m } from 'motion/react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  compareCalendarParts,
  formatDateOnlyIso,
  formatDateOnlyPt,
  parseDateOnly,
  todayPartsInZone,
  type CalendarParts,
} from '@/lib/format-datetime'
import { popoverPanel, springSnappy } from '@/lib/motion-presets'
import { useHidratado } from '@/lib/use-hidratado'

const MESES_CURTOS = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
] as const

const DIAS_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'] as const

const triggerClass =
  'flex w-full items-center gap-2 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2.5 text-left text-sm text-[rgb(var(--foreground))] outline-none transition-all focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-primary))] disabled:cursor-not-allowed disabled:opacity-50'

export type DatePickerProps = {
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  /** Limite inferior inclusivo (`YYYY-MM-DD`). */
  min?: string
  /** Limite superior inclusivo (`YYYY-MM-DD`). */
  max?: string
  /** Atalho para `max` = hoje (fuso America/Sao_Paulo). */
  maxToday?: boolean
  disabled?: boolean
  name?: string
  id?: string
  placeholder?: string
  className?: string
  /** `aria-invalid` / estado de erro visual. */
  invalid?: boolean
  required?: boolean
  'aria-label'?: string
  'aria-describedby'?: string
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0, 12)).getUTCDate()
}

function clampParts(parts: CalendarParts, min?: CalendarParts, max?: CalendarParts): CalendarParts {
  let next = parts
  if (min && compareCalendarParts(next, min) < 0) next = min
  if (max && compareCalendarParts(next, max) > 0) next = max
  return next
}

function isValidIsoDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!m) return false
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  if (month < 1 || month > 12 || day < 1) return false
  return day <= daysInMonth(year, month)
}

/**
 * Seletor de data civil (`YYYY-MM-DD`) alinhado ao design system —
 * substitui `<input type="date">` nativo (visual inconsistente e anos absurdos).
 */
export function DatePicker({
  value: valueProp,
  defaultValue = '',
  onChange,
  min,
  max,
  maxToday = false,
  disabled = false,
  name,
  id,
  placeholder = 'Selecione a data',
  className,
  invalid = false,
  required = false,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
}: DatePickerProps) {
  const autoId = useId()
  const triggerId = id ?? autoId
  const listboxId = `${triggerId}-cal`
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const mounted = useHidratado()
  const [position, setPosition] = useState({ top: 0, left: 0, width: 308 })
  const [uncontrolled, setUncontrolled] = useState(defaultValue)
  const controlled = valueProp !== undefined
  const value = controlled ? (valueProp ?? '') : uncontrolled

  const today = useMemo(() => todayPartsInZone(), [])
  const maxIso = maxToday ? formatDateOnlyIso(today) : max
  const minParts = useMemo(
    () => (min && isValidIsoDate(min) ? parseDateOnly(min) : undefined),
    [min],
  )
  const maxParts = useMemo(
    () => (maxIso && isValidIsoDate(maxIso) ? parseDateOnly(maxIso) : undefined),
    [maxIso],
  )

  const selected =
    value && isValidIsoDate(value) ? parseDateOnly(value) : null

  const [view, setView] = useState<CalendarParts>(() =>
    selected ?? clampParts(today, minParts, maxParts),
  )

  // Abrir o painel reposiciona o calendário no mês do valor atual. No render:
  // em effect o calendário abria no mês anterior e pulava no frame seguinte.
  const [abertoSincronizado, setAbertoSincronizado] = useState(open)
  if (open !== abertoSincronizado) {
    setAbertoSincronizado(open)
    if (open) setView(selected ?? clampParts(today, minParts, maxParts))
  }

  const placePanel = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    const width = Math.min(308, window.innerWidth - 24)
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))
    const panelH = 360
    const spaceBelow = window.innerHeight - rect.bottom
    const top =
      spaceBelow >= panelH + 8
        ? rect.bottom + 8
        : Math.max(12, rect.top - panelH - 8)
    setPosition({ top, left, width })
  }, [])

  function openPanel() {
    if (disabled) return
    placePanel()
    setOpen(true)
  }

  function closePanel() {
    setOpen(false)
    triggerRef.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        closePanel()
      }
    }
    function onPointer(event: MouseEvent) {
      const target = event.target as Node
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      setOpen(false)
    }
    function onViewport() {
      placePanel()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointer)
    window.addEventListener('resize', onViewport)
    window.addEventListener('scroll', onViewport, true)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointer)
      window.removeEventListener('resize', onViewport)
      window.removeEventListener('scroll', onViewport, true)
    }
  }, [open, placePanel])

  const yearMin = minParts?.year ?? today.year - 100
  const yearMax = maxParts?.year ?? today.year + 10
  const years = useMemo(() => {
    const list: number[] = []
    for (let y = yearMax; y >= yearMin; y -= 1) list.push(y)
    return list
  }, [yearMin, yearMax])

  function emit(parts: CalendarParts | null) {
    const next = parts ? formatDateOnlyIso(clampParts(parts, minParts, maxParts)) : ''
    if (!controlled) setUncontrolled(next)
    onChange?.(next)
  }

  function selectDay(day: number) {
    const next = { year: view.year, month: view.month, day }
    if (minParts && compareCalendarParts(next, minParts) < 0) return
    if (maxParts && compareCalendarParts(next, maxParts) > 0) return
    emit(next)
    setOpen(false)
  }

  function shiftMonth(delta: number) {
    let month = view.month + delta
    let year = view.year
    if (month < 1) {
      month = 12
      year -= 1
    } else if (month > 12) {
      month = 1
      year += 1
    }
    if (year < yearMin || year > yearMax) return
    setView({ year, month, day: 1 })
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openPanel()
    }
  }

  const grid = useMemo(() => {
    const firstWeekday = new Date(Date.UTC(view.year, view.month - 1, 1, 12)).getUTCDay()
    const total = daysInMonth(view.year, view.month)
    const cells: Array<{ day: number | null; parts?: CalendarParts }> = []
    for (let i = 0; i < firstWeekday; i += 1) cells.push({ day: null })
    for (let day = 1; day <= total; day += 1) {
      cells.push({ day, parts: { year: view.year, month: view.month, day } })
    }
    while (cells.length % 7 !== 0) cells.push({ day: null })
    return cells
  }, [view.year, view.month])

  const display = selected ? formatDateOnlyPt(selected) : ''
  const hojeDisponivel =
    (!minParts || compareCalendarParts(today, minParts) >= 0) &&
    (!maxParts || compareCalendarParts(today, maxParts) <= 0)

  const panel =
    mounted
      ? createPortal(
          <AnimatePresence>
            {open ? (
              <m.div
                key="date-picker-panel"
                ref={panelRef}
                id={listboxId}
                role="dialog"
                aria-label="Escolher data"
                initial="hidden"
                animate="show"
                exit="exit"
                variants={popoverPanel}
                transition={springSnappy}
                style={{
                  position: 'fixed',
                  top: position.top,
                  left: position.left,
                  width: position.width,
                  zIndex: 80,
                }}
                className="overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-elevated,var(--surface)))] p-3 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.45)]"
              >
              <div className="mb-3 flex items-center gap-1.5">
                <button
                  type="button"
                  aria-label="Mês anterior"
                  onClick={() => shiftMonth(-1)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  <select
                    aria-label="Mês"
                    value={view.month}
                    onChange={(e) =>
                      setView((v) => ({ ...v, month: Number(e.target.value), day: 1 }))
                    }
                    className="h-8 min-w-0 flex-1 cursor-pointer rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-2 text-sm font-medium text-[rgb(var(--foreground))] outline-none focus:ring-2 focus:ring-[rgb(var(--color-primary))]"
                  >
                    {MESES_CURTOS.map((label, idx) => (
                      <option key={label} value={idx + 1}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Ano"
                    value={view.year}
                    onChange={(e) =>
                      setView((v) => ({ ...v, year: Number(e.target.value), day: 1 }))
                    }
                    className="h-8 w-[5.5rem] shrink-0 cursor-pointer rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-2 text-sm font-medium text-[rgb(var(--foreground))] outline-none focus:ring-2 focus:ring-[rgb(var(--color-primary))]"
                  >
                    {years.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  aria-label="Próximo mês"
                  onClick={() => shiftMonth(1)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <div className="mb-1 grid grid-cols-7 gap-0.5">
                {DIAS_SEMANA.map((d, i) => (
                  <span
                    key={`${d}-${i}`}
                    className="flex h-8 items-center justify-center text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]"
                  >
                    {d}
                  </span>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-0.5">
                {grid.map((cell, idx) => {
                  if (!cell.day || !cell.parts) {
                    return <span key={`e-${idx}`} className="h-9" />
                  }
                  const parts = cell.parts
                  const outOfRange =
                    (minParts != null && compareCalendarParts(parts, minParts) < 0) ||
                    (maxParts != null && compareCalendarParts(parts, maxParts) > 0)
                  const isSelected =
                    selected != null && compareCalendarParts(parts, selected) === 0
                  const isToday = compareCalendarParts(parts, today) === 0
                  return (
                    <button
                      key={`${parts.year}-${parts.month}-${parts.day}`}
                      type="button"
                      disabled={outOfRange}
                      onClick={() => selectDay(parts.day)}
                      aria-pressed={isSelected}
                      aria-current={isToday ? 'date' : undefined}
                      className={[
                        'relative flex h-9 items-center justify-center rounded-lg text-sm font-medium transition-colors',
                        outOfRange
                          ? 'cursor-not-allowed text-[rgb(var(--foreground-muted))] opacity-35'
                          : 'hover:bg-[rgb(var(--background-subtle))]',
                        isSelected
                          ? 'bg-[rgb(var(--color-primary))] text-white hover:bg-[rgb(var(--color-primary))]'
                          : 'text-[rgb(var(--foreground))]',
                        isToday && !isSelected
                          ? 'ring-1 ring-inset ring-[rgb(var(--color-primary))]'
                          : '',
                      ].join(' ')}
                    >
                      {parts.day}
                    </button>
                  )
                })}
              </div>

              <div className="mt-3 flex items-center justify-between gap-2 border-t border-[rgb(var(--border))] pt-2.5">
                <button
                  type="button"
                  onClick={() => {
                    emit(null)
                    setOpen(false)
                  }}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
                >
                  Limpar
                </button>
                <button
                  type="button"
                  disabled={!hojeDisponivel}
                  onClick={() => {
                    emit(today)
                    setOpen(false)
                  }}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[rgb(var(--color-primary-fg))] transition-colors hover:bg-[rgb(var(--background-subtle))] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Hoje
                </button>
              </div>
            </m.div>
            ) : null}
          </AnimatePresence>,
          document.body,
        )
      : null

  return (
    <div className={className ? `relative ${className}` : 'relative'}>
      {name ? (
        <input type="hidden" name={name} value={value} required={required || undefined} />
      ) : null}
      <button
        ref={triggerRef}
        type="button"
        id={triggerId}
        disabled={disabled}
        aria-label={ariaLabel ?? 'Escolher data'}
        // `button` não suporta aria-invalid/aria-required; combobox suporta, e
        // é o que este gatilho é de fato — abre a lista de datas (aria-controls
        // aponta para o listbox) e carrega o valor escolhido.
        role="combobox"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-invalid={invalid || undefined}
        aria-required={required || undefined}
        aria-describedby={ariaDescribedBy}
        onClick={() => (open ? setOpen(false) : openPanel())}
        onKeyDown={onTriggerKeyDown}
        className={[
          triggerClass,
          invalid ? 'border-red-500/55 focus-visible:ring-red-500/40' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <span
          className={
            display
              ? 'min-w-0 flex-1 truncate tabular-nums'
              : 'min-w-0 flex-1 truncate text-[rgb(var(--foreground-muted))]'
          }
        >
          {display || placeholder}
        </span>
        <CalendarDays className="h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))]" />
      </button>
      {panel}
    </div>
  )
}
