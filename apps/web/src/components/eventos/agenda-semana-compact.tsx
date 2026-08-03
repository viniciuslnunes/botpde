'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { ArrowRight, CalendarDays, Clock } from 'lucide-react'
import type { TipoEvento } from '@torcida/db'
import {
  addCalendarDays,
  dayKeyInZone,
  formatTimeShort,
  sameCalendarDay,
  startOfWeekMonday,
  todayPartsInZone,
  type CalendarParts,
} from '@/lib/format-datetime'
import { fadeUp, springSnappy, staggerContainer, staggerItem } from '@/lib/motion-presets'
import { EventoTipoBadge } from '@/components/eventos/evento-tipo-badge'

export type AgendaSemanaCompactItem = {
  id: string
  titulo: string
  tipo: TipoEvento | string
  dataIso: string
  href: string
  local?: string | null
}

const DIA_LABEL = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

const TIPO_DOT: Record<string, string> = {
  GERAL: 'bg-[rgb(var(--color-primary-fg))]',
  CARAVANA: 'bg-amber-500',
  ENSAIO: 'bg-sky-500',
}

function tipoKey(tipo: string): string {
  return tipo in TIPO_DOT ? tipo : 'GERAL'
}

function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}

/**
 * Faixa da semana atual — leva o calendário para a vista Lista sem trocar de aba.
 * Dia selecionado abre o painel; "Abrir semana" vai para a vista completa.
 */
export function AgendaSemanaCompact({
  itens,
  semanaHref,
  className,
}: {
  itens: AgendaSemanaCompactItem[]
  /** Link para `?vista=semana` (mantém filtros). */
  semanaHref: string
  className?: string
}) {
  const hoje = useMemo(() => todayPartsInZone(), [])
  const weekDays = useMemo(() => {
    const start = startOfWeekMonday(hoje)
    return Array.from({ length: 7 }, (_, i) => addCalendarDays(start, i))
  }, [hoje])

  const byDay = useMemo(() => {
    const map = new Map<string, AgendaSemanaCompactItem[]>()
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

  const [diaSelecionado, setDiaSelecionado] = useState<CalendarParts>(() => hoje)
  const eventosDoDia = byDay.get(dayKeyInZone(diaSelecionado)) ?? []
  const totalSemana = itens.length

  return (
    <section
      className={cx(
        'overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface)_/_0.85)] shadow-sm backdrop-blur-sm',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-[rgb(var(--border))] px-3.5 py-2.5">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[rgb(var(--color-primary-fg))]">
            Esta semana
          </p>
          <p className="truncate text-xs text-[rgb(var(--foreground-muted))]">
            {totalSemana === 0
              ? 'Nenhum evento'
              : `${totalSemana} evento${totalSemana > 1 ? 's' : ''}`}
          </p>
        </div>
        <Link
          href={semanaHref}
          prefetch
          className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-[rgb(var(--color-primary-fg))] transition-colors hover:bg-[rgb(var(--color-primary)_/_0.1)]"
        >
          Semana
          <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
      </div>

      <div className="grid grid-cols-7 gap-1 px-2.5 py-2.5">
        {weekDays.map((day, i) => {
          const key = dayKeyInZone(day)
          const dayItens = byDay.get(key) ?? []
          const count = dayItens.length
          const ativo = sameCalendarDay(day, diaSelecionado)
          const isHoje = sameCalendarDay(day, hoje)
          const dots = dayItens.slice(0, 3)

          return (
            <button
              key={key}
              type="button"
              onClick={() => setDiaSelecionado(day)}
              aria-pressed={ativo}
              aria-current={isHoje ? 'date' : undefined}
              aria-label={`${DIA_LABEL[i]} ${day.day}${count ? `, ${count} eventos` : ', sem eventos'}`}
              className={cx(
                'flex flex-col items-center rounded-xl px-0.5 py-2 transition-colors',
                ativo
                  ? 'bg-[rgb(var(--color-primary))] text-[rgb(var(--color-primary-on))] shadow-sm'
                  : 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground))] hover:bg-[rgb(var(--border)_/_0.55)]',
              )}
            >
              <span
                className={cx(
                  'text-[9px] font-semibold uppercase tracking-wide',
                  ativo
                    ? 'text-[rgb(var(--color-primary-on)_/_0.8)]'
                    : 'text-[rgb(var(--foreground-muted))]',
                )}
              >
                {DIA_LABEL[i]}
              </span>
              <span className="mt-0.5 text-sm font-bold tabular-nums">{day.day}</span>
              <span className="mt-1 flex h-1.5 items-center justify-center gap-0.5" aria-hidden>
                {count === 0 ? (
                  <span className="h-1 w-1 rounded-full bg-transparent" />
                ) : (
                  dots.map((e) => (
                    <span
                      key={e.id}
                      className={cx(
                        'h-1 w-1 rounded-full',
                        ativo ? 'bg-[rgb(var(--color-primary-on))]' : TIPO_DOT[tipoKey(String(e.tipo))],
                      )}
                    />
                  ))
                )}
              </span>
            </button>
          )
        })}
      </div>

      <div className="border-t border-[rgb(var(--border))] px-3 py-3">
        <AnimatePresence mode="wait" initial={false}>
          <m.div
            key={dayKeyInZone(diaSelecionado)}
            variants={fadeUp}
            initial="hidden"
            animate="show"
            exit="hidden"
            transition={springSnappy}
          >
            {eventosDoDia.length === 0 ? (
              <div className="flex flex-col items-center gap-1.5 py-3 text-center">
                <CalendarDays className="h-5 w-5 text-[rgb(var(--foreground-muted))]" aria-hidden />
                <p className="text-xs text-[rgb(var(--foreground-muted))]">Sem eventos neste dia</p>
              </div>
            ) : (
              <m.ul variants={staggerContainer} initial="hidden" animate="show" className="space-y-2">
                {eventosDoDia.map((e) => (
                  <m.li key={e.id} variants={staggerItem}>
                    <Link
                      href={e.href}
                      prefetch={false}
                      className="group block rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle)_/_0.55)] px-2.5 py-2 transition-colors hover:border-[rgb(var(--color-primary)_/_0.35)] hover:bg-[rgb(var(--color-primary)_/_0.06)]"
                    >
                      <div className="flex items-center gap-1.5">
                        <EventoTipoBadge tipo={e.tipo} />
                        <span className="flex items-center gap-1 text-[10px] tabular-nums text-[rgb(var(--foreground-muted))]">
                          <Clock className="h-3 w-3" aria-hidden />
                          {formatTimeShort(e.dataIso)}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs font-semibold leading-snug text-[rgb(var(--foreground))] group-hover:text-[rgb(var(--color-primary-fg))]">
                        {e.titulo}
                      </p>
                      {e.local ? (
                        <p className="mt-0.5 truncate text-[10px] text-[rgb(var(--foreground-muted))]">
                          {e.local}
                        </p>
                      ) : null}
                    </Link>
                  </m.li>
                ))}
              </m.ul>
            )}
          </m.div>
        </AnimatePresence>
      </div>
    </section>
  )
}
