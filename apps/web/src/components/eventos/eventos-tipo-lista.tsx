'use client'

import Link from 'next/link'
import { Bus, Calendar, MapPin, Music2, Users } from 'lucide-react'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'

export type EventoTipoRow = {
  id: string
  titulo: string
  dataLabel: string
  local: string | null
  confirmados: number
}

export function EventosTipoLista({
  itens,
  basePath,
  emptyTitle,
  emptyDescription,
  variant,
}: {
  itens: EventoTipoRow[]
  basePath: '/portal/caravanas' | '/portal/bateria'
  emptyTitle: string
  emptyDescription: string
  variant: 'caravana' | 'ensaio'
}) {
  if (itens.length === 0) {
    const Icon = variant === 'caravana' ? Bus : Music2
    return (
      <MotionEmptyState
        icon={<Icon className="mb-3 h-8 w-8 text-[rgb(var(--foreground-muted))]" />}
        title={emptyTitle}
        description={emptyDescription}
        className="rounded-2xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-12 text-center"
      />
    )
  }

  return (
    <ul className="divide-y divide-[rgb(var(--border))] rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
      {itens.map((item) => (
        <li key={item.id}>
          <Link
            href={`${basePath}/${item.id}`}
            className="flex items-start justify-between gap-3 px-4 py-3 transition-colors hover:bg-[rgb(var(--background-subtle))]"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[rgb(var(--foreground))]">
                {item.titulo}
              </p>
              <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[rgb(var(--foreground-muted))]">
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {item.dataLabel}
                </span>
                {item.local && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {item.local}
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  {item.confirmados} confirmado{item.confirmados === 1 ? '' : 's'}
                </span>
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}
