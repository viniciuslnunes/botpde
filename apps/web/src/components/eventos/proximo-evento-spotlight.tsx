import Link from 'next/link'
import { ArrowRight, Clock, MapPin } from 'lucide-react'
import { EventoTipoBadge } from '@/components/eventos/evento-tipo-badge'

/** Destaque do próximo compromisso — acima da lista. */
export function ProximoEventoSpotlight({
  id,
  titulo,
  tipo,
  dataLabel,
  local,
  href,
  lotacaoLabel,
}: {
  id: string
  titulo: string
  tipo: string
  dataLabel: string
  local: string | null
  href: string
  lotacaoLabel?: string | null
}) {
  return (
    <Link
      href={href}
      prefetch
      className="group flex items-start justify-between gap-4 rounded-2xl border border-[rgb(var(--primary)_/_0.35)] bg-[rgb(var(--primary)_/_0.06)] p-4 transition-colors hover:bg-[rgb(var(--primary)_/_0.1)]"
    >
      <div className="min-w-0 space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--primary))]">
          Próximo
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <EventoTipoBadge tipo={tipo} />
          <h2 className="truncate text-base font-semibold text-[rgb(var(--foreground))]">{titulo}</h2>
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-[rgb(var(--foreground-muted))]">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {dataLabel}
          </span>
          {local && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {local}
            </span>
          )}
          {lotacaoLabel && <span>{lotacaoLabel}</span>}
        </div>
      </div>
      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-[rgb(var(--primary))] transition-transform group-hover:translate-x-0.5" />
      <span className="sr-only">Abrir {id}</span>
    </Link>
  )
}
