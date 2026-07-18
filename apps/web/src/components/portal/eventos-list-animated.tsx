'use client'

import Link from 'next/link'
import { m } from 'motion/react'
import { Bus, CalendarDays, CalendarX, Drum, MapPin, Users } from 'lucide-react'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { EventoTipoBadge } from '@/components/eventos/evento-tipo-badge'
import { springSnappy, staggerContainer, staggerItem } from '@/lib/motion-presets'

export interface EventoCardItem {
  id: string
  titulo: string
  /** Data curta para lista (ex.: sáb 18/07 · 21:00). */
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
      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
        Vai
      </span>
    )
  }
  if (status === 'LISTA_ESPERA') {
    return (
      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-300">
        Espera
      </span>
    )
  }
  return null
}

function TipoThumbFallback({ tipo }: { tipo?: string }) {
  const Icon = tipo === 'CARAVANA' ? Bus : tipo === 'ENSAIO' ? Drum : CalendarDays
  const tone =
    tipo === 'CARAVANA'
      ? 'from-amber-500/25 to-amber-500/5 text-amber-700 dark:text-amber-300'
      : tipo === 'ENSAIO'
        ? 'from-sky-500/25 to-sky-500/5 text-sky-700 dark:text-sky-300'
        : 'from-[rgb(var(--primary)_/_0.28)] to-[rgb(var(--primary)_/_0.06)] text-[rgb(var(--primary))]'
  return (
    <div
      className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${tone}`}
      aria-hidden
    >
      <Icon className="h-7 w-7 opacity-80" />
    </div>
  )
}

function EventoGridCard({ evento }: { evento: EventoCardItem }) {
  return (
    <m.div variants={staggerItem} whileTap={{ scale: 0.99 }} transition={springSnappy} className="h-full">
      <Link
        href={`/portal/eventos/${evento.id}`}
        prefetch
        className={[
          'group flex h-full flex-col overflow-hidden rounded-2xl border bg-[rgb(var(--surface)_/_0.85)] shadow-sm backdrop-blur-sm transition-all',
          evento.passado
            ? 'border-[rgb(var(--border))] opacity-70'
            : 'border-[rgb(var(--border))] hover:border-[rgb(var(--primary)_/_0.4)] hover:shadow-md',
        ].join(' ')}
      >
        <div className="relative aspect-[5/3] w-full overflow-hidden bg-[rgb(var(--background-subtle))]">
          {evento.fotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- capas externas
            <img
              src={evento.fotoUrl}
              alt=""
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              loading="lazy"
            />
          ) : (
            <TipoThumbFallback tipo={evento.tipo} />
          )}
          <div className="absolute left-2.5 top-2.5 flex flex-wrap items-center gap-1.5">
            {evento.tipo && <EventoTipoBadge tipo={evento.tipo} />}
            {evento.diasLabel && (
              <span className="rounded-full bg-[rgb(var(--surface)_/_0.92)] px-2 py-0.5 text-[10px] font-semibold tabular-nums text-[rgb(var(--foreground))] shadow-sm backdrop-blur">
                {evento.diasLabel}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-2 p-3.5">
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-[rgb(var(--foreground))] group-hover:text-[rgb(var(--primary))]">
              {evento.titulo}
            </h3>
            {!evento.passado && <RsvpBadge status={evento.rsvpStatus} />}
          </div>

          <div className="mt-auto space-y-1 text-xs text-[rgb(var(--foreground-muted))]">
            <p className="truncate font-medium tabular-nums text-[rgb(var(--foreground)_/_0.85)]">
              {evento.dataLabel}
            </p>
            {evento.local && (
              <p className="flex items-center gap-1 truncate">
                <MapPin className="h-3 w-3 shrink-0" />
                {evento.local}
              </p>
            )}
            <p className="flex items-center gap-1 truncate">
              <Users className="h-3 w-3 shrink-0" />
              {evento.lotacaoLabel
                ? `${evento.lotacaoLabel} conf.`
                : `${evento.confirmados} ${evento.passado ? 'presença(s)' : 'conf.'}`}
            </p>
          </div>
        </div>
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
        className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[rgb(var(--border))] py-12 text-center"
      />
    )
  }

  return (
    <m.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-3.5 xl:grid-cols-3"
    >
      {eventos.map((e) => (
        <EventoGridCard key={e.id} evento={e} />
      ))}
    </m.div>
  )
}

/** Miniatura reutilizável (spotlight / aside). */
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
        'relative shrink-0 overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]',
        className ?? 'h-16 w-16',
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
