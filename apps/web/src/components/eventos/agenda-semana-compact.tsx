'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { ArrowRight, CalendarDays, Clock, Link2, Trophy } from 'lucide-react'
import type { TipoEvento } from '@torcida/db'
import { agruparDiaOperacional } from '@torcida/types'
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
import { vincularEventoAPartida } from '@/app/admin/eventos/actions'

export type AgendaSemanaCompactItem = {
  id: string
  titulo: string
  tipo: TipoEvento | string
  dataIso: string
  href: string
  local?: string | null
  partidaId?: string | null
  projetoId?: string | null
  serieId?: string | null
}

export type AgendaSemanaPartidaItem = {
  id: string
  dataIso: string
  adversario?: string | null
  mando?: string | null
  competicao?: string | null
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

function labelMando(mando: string | null | undefined) {
  if (mando === 'CASA') return 'Casa'
  if (mando === 'FORA') return 'Fora'
  return null
}

/**
 * Faixa da semana — entrada operacional com cluster do dia (partida + eventos).
 */
export function AgendaSemanaCompact({
  itens,
  partidas = [],
  semanaHref,
  className,
  podeVincularPartida = false,
  titulo = 'Esta semana',
}: {
  itens: AgendaSemanaCompactItem[]
  partidas?: AgendaSemanaPartidaItem[]
  /** Link para `?vista=semana` (mantém filtros). */
  semanaHref: string
  className?: string
  /** Gestor com events:manage — CTA vincular. */
  podeVincularPartida?: boolean
  titulo?: string
}) {
  const hoje = useMemo(() => todayPartsInZone(), [])
  const weekDays = useMemo(() => {
    const start = startOfWeekMonday(hoje)
    return Array.from({ length: 7 }, (_, i) => addCalendarDays(start, i))
  }, [hoje])

  const clusters = useMemo(() => {
    return agruparDiaOperacional(
      itens.map((e) => ({
        id: e.id,
        dataIso: e.dataIso,
        tipo: String(e.tipo),
        titulo: e.titulo,
        href: e.href,
        partidaId: e.partidaId,
        projetoId: e.projetoId,
        serieId: e.serieId,
        local: e.local,
      })),
      partidas.map((p) => ({
        id: p.id,
        dataIso: p.dataIso,
        adversario: p.adversario,
        mando: p.mando,
        competicao: p.competicao,
      })),
      dayKeyInZone,
    )
  }, [itens, partidas])

  const [diaSelecionado, setDiaSelecionado] = useState<CalendarParts>(() => hoje)
  const dayKey = dayKeyInZone(diaSelecionado)
  const diaOps = clusters.get(dayKey)
  const eventosDoDia = diaOps?.eventos ?? []
  const partidaDia = diaOps?.partida ?? null
  const sugestoes = diaOps?.sugestoesVincular ?? []
  const totalSemana = itens.length
  const temJogoNaSemana = useMemo(() => {
    for (const d of weekDays) {
      if (clusters.get(dayKeyInZone(d))?.partida) return true
    }
    return false
  }, [weekDays, clusters])

  const [pendingId, setPendingId] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function onVincular(eventoId: string, partidaId: string) {
    setMsg(null)
    setPendingId(eventoId)
    startTransition(async () => {
      const r = await vincularEventoAPartida(eventoId, partidaId)
      setPendingId(null)
      if (!r.ok) setMsg(r.message)
    })
  }

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
            {titulo}
          </p>
          <p className="truncate text-xs text-[rgb(var(--foreground-muted))]">
            {totalSemana === 0
              ? temJogoNaSemana
                ? 'Só jogo — sem eventos ainda'
                : 'Nenhum evento'
              : `${totalSemana} evento${totalSemana > 1 ? 's' : ''}${temJogoNaSemana ? ' · há jogo' : ''}`}
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
          const ops = clusters.get(key)
          const dayItens = ops?.eventos ?? []
          const count = dayItens.length
          const temJogo = Boolean(ops?.partida)
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
              aria-label={`${DIA_LABEL[i]} ${day.day}${temJogo ? ', jogo' : ''}${count ? `, ${count} eventos` : ', sem eventos'}`}
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
                {temJogo ? (
                  <span
                    className={cx(
                      'h-1.5 w-1.5 rounded-sm',
                      ativo ? 'bg-[rgb(var(--color-primary-on))]' : 'bg-emerald-500',
                    )}
                  />
                ) : null}
                {count === 0 && !temJogo ? (
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
            key={dayKey}
            variants={fadeUp}
            initial="hidden"
            animate="show"
            exit="hidden"
            transition={springSnappy}
            className="space-y-3"
          >
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                Operação do dia
              </p>
              {partidaDia ? (
                <div className="mt-1.5 flex items-start gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/8 px-2.5 py-2">
                  <Trophy className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[rgb(var(--foreground))]">
                      Jogo
                      {partidaDia.adversario ? ` · ${partidaDia.adversario}` : ''}
                    </p>
                    <p className="text-[10px] text-[rgb(var(--foreground-muted))]">
                      {[labelMando(partidaDia.mando), partidaDia.competicao, formatTimeShort(partidaDia.dataIso)]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>

            {eventosDoDia.length === 0 && !partidaDia ? (
              <div className="flex flex-col items-center gap-1.5 py-3 text-center">
                <CalendarDays className="h-5 w-5 text-[rgb(var(--foreground-muted))]" aria-hidden />
                <p className="text-xs text-[rgb(var(--foreground-muted))]">Sem eventos neste dia</p>
              </div>
            ) : eventosDoDia.length === 0 ? (
              <p className="text-xs text-[rgb(var(--foreground-muted))]">
                Há jogo, mas nenhum evento ligado — crie caravana ou ação na sede.
              </p>
            ) : (
              <m.ul variants={staggerContainer} initial="hidden" animate="show" className="space-y-2">
                {eventosDoDia.map((e) => {
                  const precisaVincular =
                    podeVincularPartida &&
                    partidaDia &&
                    sugestoes.some((s) => s.id === e.id)
                  return (
                    <m.li key={e.id} variants={staggerItem} className="space-y-1.5">
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
                      {precisaVincular ? (
                        <button
                          type="button"
                          disabled={isPending && pendingId === e.id}
                          onClick={() => onVincular(e.id, partidaDia.id)}
                          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-2 py-1.5 text-[11px] font-semibold text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))] disabled:opacity-60"
                        >
                          <Link2 className="h-3 w-3" aria-hidden />
                          {isPending && pendingId === e.id
                            ? 'Vinculando…'
                            : 'Vincular à partida do dia'}
                        </button>
                      ) : null}
                    </m.li>
                  )
                })}
              </m.ul>
            )}
            {msg ? <p className="text-[11px] text-rose-600 dark:text-rose-300">{msg}</p> : null}
          </m.div>
        </AnimatePresence>
      </div>
    </section>
  )
}
