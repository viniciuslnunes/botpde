import Link from 'next/link'
import { CalendarDays, MapPin } from 'lucide-react'
import { formatRelative } from '@/lib/format-datetime'
import { RsvpButtons } from '@/app/portal/eventos/[id]/rsvp-buttons'
import type { EventoPostEmbed } from '@/lib/feed'

interface PostEventoEmbedProps {
  evento: EventoPostEmbed
}

export function PostEventoEmbed({ evento }: PostEventoEmbedProps) {
  return (
    <div className="mt-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={`/portal/eventos/${evento.id}`}
            className="text-sm font-semibold text-[rgb(var(--foreground))] hover:underline"
          >
            {evento.titulo}
          </Link>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-[rgb(var(--foreground-muted))]">
            <CalendarDays className="h-3.5 w-3.5 shrink-0" />
            <time dateTime={new Date(evento.data).toISOString()} suppressHydrationWarning>
              {formatRelative(evento.data)}
            </time>
          </p>
          {evento.local && (
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-[rgb(var(--foreground-muted))]">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              {evento.local}
            </p>
          )}
        </div>
      </div>
      <div className="mt-3">
        <RsvpButtons eventoId={evento.id} statusAtual={evento.meuRsvp} />
      </div>
    </div>
  )
}
