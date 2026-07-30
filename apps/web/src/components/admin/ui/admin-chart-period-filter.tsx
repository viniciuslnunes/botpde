'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { CalendarRange } from 'lucide-react'
import { buildAdminHref } from '@/lib/admin-href'

export type AdminChartPeriod = '3m' | '6m' | '9m' | 'custom'

export interface AdminChartPeriodFilterProps {
  basePath: string
  activePeriod: AdminChartPeriod
  customStart: string
  customEnd: string
  maxDate: string
  extraParams?: Record<string, string | undefined>
}

const PERIODS: Array<{ id: Exclude<AdminChartPeriod, 'custom'>; label: string }> = [
  { id: '3m', label: '3 meses' },
  { id: '6m', label: '6 meses' },
  { id: '9m', label: '9 meses' },
]

const tabBase =
  'inline-flex h-7 items-center justify-center whitespace-nowrap rounded-md px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--primary)_/_0.35)]'

/**
 * Controle URL-driven para séries temporais. Presets funcionam sem JS e o
 * range personalizado usa GET, preservando os demais filtros da página.
 */
export function AdminChartPeriodFilter({
  basePath,
  activePeriod,
  customStart,
  customEnd,
  maxDate,
  extraParams,
}: AdminChartPeriodFilterProps) {
  const [customOpen, setCustomOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0, width: 352 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLFormElement>(null)
  const firstInputRef = useRef<HTMLInputElement>(null)

  function openCustom() {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) {
      const width = Math.min(352, window.innerWidth - 24)
      const left = Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12))
      const spaceBelow = window.innerHeight - rect.bottom
      const top = spaceBelow >= 176 ? rect.bottom + 8 : Math.max(12, rect.top - 168)
      setPosition({ top, left, width })
    }
    setCustomOpen(true)
  }

  useEffect(() => {
    if (!customOpen) return

    firstInputRef.current?.focus()
    function closeOnOutsideClick(event: MouseEvent) {
      const target = event.target as Node
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        setCustomOpen(false)
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setCustomOpen(false)
        triggerRef.current?.focus()
      }
    }
    function closeOnViewportChange() {
      setCustomOpen(false)
    }

    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    window.addEventListener('resize', closeOnViewportChange)
    window.addEventListener('scroll', closeOnViewportChange, true)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('resize', closeOnViewportChange)
      window.removeEventListener('scroll', closeOnViewportChange, true)
    }
  }, [customOpen])

  return (
    <div className="min-w-0">
      <nav
        aria-label="Período do gráfico"
        className="app-scrollbar-none flex max-w-full gap-0.5 overflow-x-auto rounded-lg bg-[rgb(var(--background-subtle))] p-0.5"
      >
        {PERIODS.map((period) => {
          const active = activePeriod === period.id
          return (
            <Link
              key={period.id}
              href={buildAdminHref(basePath, {
                ...extraParams,
                periodoGrafico: period.id === '3m' ? undefined : period.id,
              })}
              onClick={() => setCustomOpen(false)}
              aria-current={active ? 'page' : undefined}
              className={[
                tabBase,
                active
                  ? 'bg-[rgb(var(--surface))] font-semibold text-[rgb(var(--foreground))] shadow-sm ring-1 ring-inset ring-[rgb(var(--border))]'
                  : 'text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]',
              ].join(' ')}
            >
              {period.label}
            </Link>
          )
        })}
        <button
          ref={triggerRef}
          type="button"
          onClick={() => (customOpen ? setCustomOpen(false) : openCustom())}
          aria-expanded={customOpen}
          aria-controls="chart-custom-period-menu"
          className={[
            tabBase,
            'gap-1.5',
            activePeriod === 'custom'
              ? 'bg-[rgb(var(--surface))] font-semibold text-[rgb(var(--foreground))] shadow-sm ring-1 ring-inset ring-[rgb(var(--border))]'
              : 'text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]',
          ].join(' ')}
        >
          <CalendarRange className="h-3.5 w-3.5" aria-hidden />
          Personalizado
        </button>
      </nav>

      {customOpen && typeof document !== 'undefined'
        ? createPortal(
            <form
              ref={menuRef}
              id="chart-custom-period-menu"
              method="GET"
              action={basePath}
              onSubmit={() => setCustomOpen(false)}
              role="dialog"
              aria-label="Intervalo personalizado do gráfico"
              className="fixed z-50 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3 shadow-xl"
              style={{
                top: position.top,
                left: position.left,
                width: position.width,
              }}
            >
              <p className="mb-3 text-sm font-semibold text-[rgb(var(--foreground))]">
                Intervalo personalizado
              </p>
              {Object.entries(extraParams ?? {}).map(([name, value]) =>
                value ? <input key={name} type="hidden" name={name} value={value} /> : null,
              )}
              <input type="hidden" name="periodoGrafico" value="custom" />
              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1 text-xs font-medium text-[rgb(var(--foreground-muted))]">
                  De
                  <input
                    ref={firstInputRef}
                    type="date"
                    name="de"
                    required
                    defaultValue={customStart}
                    max={maxDate}
                    className="h-8 min-w-0 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-2 text-xs text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))] focus:ring-2 focus:ring-[rgb(var(--primary)_/_0.2)]"
                  />
                </label>
                <label className="grid gap-1 text-xs font-medium text-[rgb(var(--foreground-muted))]">
                  Até
                  <input
                    type="date"
                    name="ate"
                    required
                    defaultValue={customEnd}
                    max={maxDate}
                    className="h-8 min-w-0 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-2 text-xs text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))] focus:ring-2 focus:ring-[rgb(var(--primary)_/_0.2)]"
                  />
                </label>
              </div>
              <button
                type="submit"
                className="mt-3 h-8 w-full rounded-lg bg-[rgb(var(--color-primary))] px-3 text-xs font-semibold text-[rgb(var(--color-primary-on))] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--primary)_/_0.35)]"
              >
                Aplicar período
              </button>
            </form>,
            document.body,
          )
        : null}
    </div>
  )
}
