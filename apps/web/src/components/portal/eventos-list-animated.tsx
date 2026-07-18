'use client'

import Link from 'next/link'
import { m } from 'motion/react'
import {
  Bus,
  CalendarDays,
  CalendarX,
  ChevronRight,
  Drum,
} from 'lucide-react'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { EventoTipoBadge } from '@/components/eventos/evento-tipo-badge'
import { springSnappy, staggerContainer, staggerItem } from '@/lib/motion-presets'

export interface EventoCardItem {
  id: string
  titulo: string
  /** Data curta para lista (ex.: sáb. 18/07 · 21:00). */
  dataLabel: string
  local: string | null
  fotoUrl?: string | null
  tenantNome: string | null
  passado: boolean
  diasLabel: string | null
  rsvpStatus?: string
  confirmados: number
  tipo?: string
  lotacaoLabel?: string
}

function RsvpBadge({ status }: { status?: string }) {
  if (status === 'CONFIRMADO') {
    return (
      <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
        Vai
      </span>
    )
  }
  if (status === 'LISTA_ESPERA') {
    return (
      <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
        Espera
      </span>
    )
  }
  if (status === 'RECUSADO') {
    return (
      <span className="rounded-md bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">
        Não
      </span>
    )
  }
  return null
}

function TipoThumbFallback({ tipo }: { tipo?: string }) {
  const Icon = tipo === 'CARAVANA' ? Bus : tipo === 'ENSAIO' ? Drum : CalendarDays
  const tone =
    tipo === 'CARAVANA'
      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
      : tipo === 'ENSAIO'
        ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
        : 'bg-[rgb(var(--primary)_/_0.12)] text-[rgb(var(--primary))]'
  return (
    <div
      className={`flex h-full w-full items-center justify-center ${tone}`}
      aria-hidden
    >
      <Icon className="h-5 w-5" />
    </div>
  )
}

function EventoThumb({
  fotoUrl,
  tipo,
  passado,
}: {
  fotoUrl?: string | null
  tipo?: string
  passado?: boolean
}) {
  return (
    <div
      className={[
        'relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] sm:h-16 sm:w-16',
        passado ? 'opacity-70' : '',
      ].join(' ')}
    >
      {fotoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- capas externas (Unsplash/seed)
        <img src={fotoUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <TipoThumbFallback tipo={tipo} />
      )}
    </div>
  )
}

function EventoCardLink({ evento }: { evento: EventoCardItem }) {
  const metaParts = [
    evento.dataLabel,
    evento.local,
    evento.lotacaoLabel
      ? `${evento.lotacaoLabel} conf.`
      : `${evento.confirmados} ${evento.passado ? 'presença(s)' : 'conf.'}`,
  ].filter(Boolean)

  return (
    <m.div variants={staggerItem} whileTap={{ scale: 0.995 }} transition={springSnappy}>
      <Link
        href={`/portal/eventos/${evento.id}`}
        prefetch
        className={[
          'group flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors sm:gap-3.5 sm:px-3.5 sm:py-3',
          evento.passado
            ? 'border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] opacity-75'
            : 'border-[rgb(var(--border))] bg-[rgb(var(--surface))] hover:border-[rgb(var(--primary)_/_0.35)] hover:bg-[rgb(var(--primary)_/_0.04)]',
        ].join(' ')}
      >
        <EventoThumb fotoUrl={evento.fotoUrl} tipo={evento.tipo} passado={evento.passado} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {evento.tipo && <EventoTipoBadge tipo={evento.tipo} />}
            {evento.diasLabel && (
              <span
                className={[
                  'text-[11px] font-semibold tabular-nums',
                  evento.diasLabel === 'Hoje' || evento.diasLabel === 'Amanhã'
                    ? 'text-[rgb(var(--primary))]'
                    : 'text-[rgb(var(--foreground-muted))]',
                ].join(' ')}
              >
                {evento.diasLabel}
              </span>
            )}
            {!evento.passado && <RsvpBadge status={evento.rsvpStatus} />}
            {evento.tenantNome && (
              <span className="truncate text-[11px] text-[rgb(var(--foreground-muted))]">
                {evento.tenantNome}
              </span>
            )}
          </div>
          <h3 className="mt-0.5 truncate text-sm font-semibold leading-snug text-[rgb(var(--foreground))] group-hover:text-[rgb(var(--primary))]">
            {evento.titulo}
          </h3>
          <p className="mt-0.5 flex min-w-0 items-center gap-1.5 truncate text-xs text-[rgb(var(--foreground-muted))]">
            <span className="truncate">{metaParts.join(' · ')}</span>
          </p>
        </div>

        <ChevronRight
          className="h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))] transition-transform group-hover:translate-x-0.5 group-hover:text-[rgb(var(--primary))]"
          aria-hidden
        />
      </Link>
    </m.div>
  )
}

export function EventosListAnimated({
  eventos,
  emptyTitle = 'Nenhum evento agendado',
  emptyDescription = 'Fique de olho — novidades em breve!',
}: {
  eventos: EventoCardItem[]
  emptyTitle?: string
  emptyDescription?: string
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
    <m.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-1.5">
      {eventos.map((e) => (
        <EventoCardLink key={e.id} evento={e} />
      ))}
    </m.div>
  )
}

/** Miniatura reutilizável no spotlight. */
export function EventoListaThumb({
  fotoUrl,
  tipo,
  className,
}: {
  fotoUrl?: string | null
  tipo?: string
  className?: string
}) {
  return (
    <div
      className={[
        'relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]',
        className ?? '',
      ].join(' ')}
    >
      {fotoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={fotoUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <TipoThumbFallback tipo={tipo} />
      )}
    </div>
  )
}
