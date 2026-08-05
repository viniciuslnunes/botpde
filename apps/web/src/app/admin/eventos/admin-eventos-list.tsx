'use client'

import Link from 'next/link'
import { AnimatePresence, m } from 'motion/react'
import {
  AlertTriangle,
  CalendarX,
  ChevronRight,
  Clock,
  MapPin,
  Users,
} from 'lucide-react'
import { ExcluirEventoButton } from '@/components/admin/evento-forms'
import { EventoTipoBadge } from '@/components/eventos/evento-tipo-badge'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { EventoListaThumb } from '@/components/portal/eventos-list-animated'
import { springSnappy, staggerContainer, staggerItem } from '@/lib/motion-presets'
import type { TipoEvento } from '@torcida/db'

export interface AdminEventoItem {
  id: string
  titulo: string
  descricao: string | null
  dataLabel: string
  local: string | null
  fotoUrl?: string | null
  confirmados: number
  /** Capacidade efetiva (evento ou sede); null = sem teto. */
  capacidade?: number | null
  passado: boolean
  tipo: TipoEvento | string
  serieId?: string | null
  lotacaoLabel?: string | null
  embarcados?: number | null
  /** "Hoje" / "Amanhã" / "Em N dias" — só em próximos. */
  diasLabel?: string | null
  /** Jogo vinculado (adversário · mando). */
  partidaLabel?: string | null
}

function lotacaoTone(confirmados: number, capacidade: number | null | undefined) {
  if (capacidade == null || capacidade <= 0) return null
  const pct = confirmados / capacidade
  if (pct >= 1) return 'cheia' as const
  if (pct >= 0.85) return 'alta' as const
  return 'ok' as const
}

function LotacaoBar({
  confirmados,
  capacidade,
  label,
}: {
  confirmados: number
  capacidade: number
  label: string
}) {
  const pct = Math.min(100, Math.round((confirmados / capacidade) * 100))
  const tone = lotacaoTone(confirmados, capacidade)
  const bar =
    tone === 'cheia'
      ? 'bg-rose-500'
      : tone === 'alta'
        ? 'bg-amber-500'
        : 'bg-[rgb(var(--color-primary-fg))]'

  return (
    <div className="mt-2.5 space-y-1">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="flex items-center gap-1 font-medium text-[rgb(var(--foreground-muted))]">
          <Users className="h-3 w-3" aria-hidden />
          {label}
        </span>
        <span
          className={[
            'tabular-nums font-semibold',
            tone === 'cheia'
              ? 'text-rose-600 dark:text-rose-300'
              : tone === 'alta'
                ? 'text-amber-700 dark:text-amber-300'
                : 'text-[rgb(var(--foreground))]',
          ].join(' ')}
        >
          {pct}%
        </span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-[rgb(var(--border)_/_0.7)]"
        role="meter"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Lotação ${label}`}
      >
        <m.div
          className={`h-full rounded-full ${bar}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={springSnappy}
        />
      </div>
      {tone === 'cheia' || tone === 'alta' ? (
        <p
          className={[
            'flex items-center gap-1 text-[10px] font-medium',
            tone === 'cheia'
              ? 'text-rose-600 dark:text-rose-300'
              : 'text-amber-700 dark:text-amber-300',
          ].join(' ')}
        >
          <AlertTriangle className="h-3 w-3" aria-hidden />
          {tone === 'cheia' ? 'Lotação esgotada' : 'Quase lotado'}
        </p>
      ) : null}
    </div>
  )
}

function AdminEventoCard({
  evento,
  detailBasePath,
}: {
  evento: AdminEventoItem
  detailBasePath: string
}) {
  const tone = lotacaoTone(evento.confirmados, evento.capacidade)
  const href = `${detailBasePath}/${evento.id}`

  return (
    <m.article
      variants={staggerItem}
      layout
      whileHover={{ y: -1 }}
      transition={springSnappy}
      className={[
        'group rounded-xl border transition-colors',
        evento.passado
          ? 'border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] opacity-75'
          : tone === 'cheia'
            ? 'border-rose-500/35 bg-[rgb(var(--surface))] hover:border-rose-500/50'
            : 'border-[rgb(var(--border))] bg-[rgb(var(--surface))] hover:border-[rgb(var(--color-primary)_/_0.35)] hover:shadow-sm',
      ].join(' ')}
    >
      <div className="flex items-stretch gap-3 p-3 sm:gap-4 sm:p-3.5">
        <Link href={href} prefetch className="shrink-0 self-start">
          <EventoListaThumb
            fotoUrl={evento.fotoUrl}
            tipo={evento.tipo}
            className="h-16 w-20 transition-transform duration-200 group-hover:scale-[1.02] sm:h-[4.75rem] sm:w-[7.25rem]"
          />
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <EventoTipoBadge tipo={evento.tipo} />
            {evento.serieId ? (
              <span className="rounded bg-[rgb(var(--background-subtle))] px-1.5 py-0.5 text-[10px] font-medium uppercase text-[rgb(var(--foreground-muted))]">
                Série
              </span>
            ) : null}
            {evento.partidaLabel ? (
              <span className="rounded bg-emerald-500/12 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-500/25 dark:text-emerald-300">
                {evento.partidaLabel}
              </span>
            ) : null}
            {evento.diasLabel ? (
              <span className="rounded-md bg-[rgb(var(--color-primary)_/_0.12)] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-[rgb(var(--color-primary-fg))] ring-1 ring-inset ring-[rgb(var(--color-primary)_/_0.28)]">
                {evento.diasLabel}
              </span>
            ) : null}
          </div>

          <Link href={href} prefetch className="mt-1 block min-w-0">
            <h3 className="truncate text-sm font-semibold text-[rgb(var(--foreground))] group-hover:text-[rgb(var(--color-primary-fg))] sm:text-[15px]">
              {evento.titulo}
            </h3>
          </Link>

          {evento.descricao ? (
            <p className="mt-0.5 line-clamp-1 text-xs text-[rgb(var(--foreground-muted))] sm:line-clamp-2">
              {evento.descricao}
            </p>
          ) : null}

          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[rgb(var(--foreground-muted))]">
            <span className="flex items-center gap-1 tabular-nums">
              <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {evento.dataLabel}
            </span>
            {evento.local ? (
              <span className="flex min-w-0 items-center gap-1">
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">{evento.local}</span>
              </span>
            ) : null}
            {evento.capacidade == null ? (
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {evento.lotacaoLabel ??
                  `${evento.confirmados} confirmado${evento.confirmados !== 1 ? 's' : ''}`}
              </span>
            ) : null}
            {evento.embarcados != null ? (
              <span>
                {evento.embarcados} embarcado{evento.embarcados !== 1 ? 's' : ''}
              </span>
            ) : null}
          </div>

          {evento.capacidade != null && evento.capacidade > 0 ? (
            <LotacaoBar
              confirmados={evento.confirmados}
              capacidade={evento.capacidade}
              label={
                evento.lotacaoLabel ?? `${evento.confirmados}/${evento.capacidade} confirmados`
              }
            />
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-stretch justify-between gap-2 self-stretch sm:items-end">
          <m.div whileTap={{ scale: 0.96 }} transition={springSnappy}>
            <Link
              href={href}
              prefetch
              className="inline-flex items-center justify-center gap-1 rounded-lg bg-[rgb(var(--color-primary))] px-3 py-1.5 text-xs font-semibold text-[rgb(var(--color-primary-on))] transition-opacity hover:opacity-90"
            >
              Abrir
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </m.div>
          <ExcluirEventoButton eventoId={evento.id} serieId={evento.serieId} />
        </div>
      </div>
    </m.article>
  )
}

export function AdminEventosList({
  eventos,
  emptyTitle = 'Nenhum evento agendado',
  emptyDescription,
  detailBasePath = '/admin/eventos',
}: {
  eventos: AdminEventoItem[]
  emptyTitle?: string
  emptyDescription?: string
  /** Prefixo do detalhe (ex.: `/admin/caravanas` → alias com redirect). */
  detailBasePath?: string
}) {
  if (eventos.length === 0) {
    return (
      <MotionEmptyState
        icon={<CalendarX className="mb-2 h-8 w-8 text-[rgb(var(--foreground-muted))]" />}
        title={emptyTitle}
        description={emptyDescription}
        className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[rgb(var(--border))] py-10 text-center"
      />
    )
  }

  return (
    <m.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-2.5">
      <AnimatePresence mode="popLayout">
        {eventos.map((e) => (
          <AdminEventoCard key={e.id} evento={e} detailBasePath={detailBasePath} />
        ))}
      </AnimatePresence>
    </m.div>
  )
}
