'use client'

import Link from 'next/link'
import { m } from 'motion/react'
import { CalendarX, ChevronRight, Clock, MapPin, Users } from 'lucide-react'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { springSnappy, staggerContainer, staggerItem } from '@/lib/motion-presets'

export interface EventoCardItem {
  id: string
  titulo: string
  dataLabel: string
  local: string | null
  tenantNome: string | null
  passado: boolean
  diasLabel: string | null
  rsvpStatus?: string
  confirmados: number
}

function RsvpBadge({ status }: { status?: string }) {
  if (status === 'CONFIRMADO') {
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
        Confirmado ✓
      </span>
    )
  }
  if (status === 'RECUSADO') {
    return (
      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900 dark:text-red-300">
        Recusado
      </span>
    )
  }
  return null
}

function EventoCardLink({ evento }: { evento: EventoCardItem }) {
  return (
    <m.div variants={staggerItem} whileTap={{ scale: 0.98 }} transition={springSnappy}>
      <Link
        href={`/portal/eventos/${evento.id}`}
        className={[
          'group flex flex-col gap-3 rounded-xl border p-5 transition-all hover:shadow-md',
          evento.passado
            ? 'border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] opacity-70'
            : 'border-[rgb(var(--border))] bg-[rgb(var(--surface))]',
        ].join(' ')}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-[rgb(var(--foreground))]">{evento.titulo}</h3>
              {evento.diasLabel && (
                <span
                  className={[
                    'rounded-full px-2 py-0.5 text-xs font-semibold',
                    evento.diasLabel === 'Hoje' || evento.diasLabel === 'Amanhã'
                      ? 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300'
                      : 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]',
                  ].join(' ')}
                >
                  {evento.diasLabel}
                </span>
              )}
              {evento.tenantNome && (
                <span className="rounded-full bg-[rgb(var(--primary)_/_0.15)] px-2 py-0.5 text-xs font-medium text-[rgb(var(--primary))]">
                  {evento.tenantNome}
                </span>
              )}
              {!evento.passado && <RsvpBadge status={evento.rsvpStatus} />}
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-[rgb(var(--foreground-muted))]">
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {evento.dataLabel}
              </span>
              {evento.local && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {evento.local}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {evento.confirmados} {evento.passado ? 'presença(s)' : 'confirmado(s)'}
              </span>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))] transition-transform group-hover:translate-x-0.5" />
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
        className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[rgb(var(--border))] py-12 text-center"
      />
    )
  }

  return (
    <m.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-3">
      {eventos.map((e) => (
        <EventoCardLink key={e.id} evento={e} />
      ))}
    </m.div>
  )
}
