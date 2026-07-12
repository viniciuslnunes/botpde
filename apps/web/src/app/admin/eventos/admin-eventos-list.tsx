'use client'

import Link from 'next/link'
import { AnimatePresence, m } from 'motion/react'
import { CalendarX, ChevronRight, Clock, MapPin, Users } from 'lucide-react'
import { ExcluirEventoButton } from '@/components/admin/evento-forms'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { springSnappy, staggerContainer, staggerItem } from '@/lib/motion-presets'

export interface AdminEventoItem {
  id: string
  titulo: string
  descricao: string | null
  dataLabel: string
  local: string | null
  confirmados: number
  passado: boolean
}

function AdminEventoCard({ evento }: { evento: AdminEventoItem }) {
  return (
    <m.div
      variants={staggerItem}
      layout
      className={[
        'rounded-xl border p-4 transition-all',
        evento.passado
          ? 'border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] opacity-70'
          : 'border-[rgb(var(--border))] bg-[rgb(var(--surface))] hover:shadow-sm',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold text-[rgb(var(--foreground))]">{evento.titulo}</h3>
          {evento.descricao && (
            <p className="mt-0.5 line-clamp-2 text-xs text-[rgb(var(--foreground-muted))]">{evento.descricao}</p>
          )}
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
              {evento.confirmados} confirmado{evento.confirmados !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <m.div whileTap={{ scale: 0.96 }} transition={springSnappy}>
            <Link
              href={`/admin/eventos/${evento.id}`}
              className="flex items-center gap-1 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
            >
              Editar
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </m.div>
          <ExcluirEventoButton eventoId={evento.id} />
        </div>
      </div>
    </m.div>
  )
}

export function AdminEventosList({ eventos }: { eventos: AdminEventoItem[] }) {
  if (eventos.length === 0) {
    return (
      <MotionEmptyState
        icon={<CalendarX className="mb-2 h-8 w-8 text-[rgb(var(--foreground-muted))]" />}
        title="Nenhum evento agendado"
        className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[rgb(var(--border))] py-10 text-center"
      />
    )
  }

  return (
    <m.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-3">
      <AnimatePresence mode="popLayout">
        {eventos.map((e) => (
          <AdminEventoCard key={e.id} evento={e} />
        ))}
      </AnimatePresence>
    </m.div>
  )
}
