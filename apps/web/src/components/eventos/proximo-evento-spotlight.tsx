import Link from 'next/link'
import { ArrowRight, MapPin } from 'lucide-react'
import { EventoTipoBadge } from '@/components/eventos/evento-tipo-badge'
import { EventoListaThumb } from '@/components/portal/eventos-list-animated'

/** Destaque do próximo compromisso — compacto, acima da lista. */
export function ProximoEventoSpotlight({
  id,
  titulo,
  tipo,
  dataLabel,
  local,
  href,
  lotacaoLabel,
  fotoUrl,
  diasLabel,
}: {
  id: string
  titulo: string
  tipo: string
  dataLabel: string
  local: string | null
  href: string
  lotacaoLabel?: string | null
  fotoUrl?: string | null
  diasLabel?: string | null
}) {
  const meta = [dataLabel, local, lotacaoLabel].filter(Boolean).join(' · ')

  return (
    <Link
      href={href}
      prefetch
      className="group flex items-center gap-3 rounded-xl border border-[rgb(var(--primary)_/_0.4)] bg-[rgb(var(--primary)_/_0.08)] px-3 py-2.5 transition-colors hover:bg-[rgb(var(--primary)_/_0.12)] sm:gap-3.5 sm:px-3.5 sm:py-3"
    >
      <EventoListaThumb fotoUrl={fotoUrl} tipo={tipo} className="h-14 w-14 sm:h-16 sm:w-16" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[rgb(var(--primary))]">
            Próximo
          </p>
          <EventoTipoBadge tipo={tipo} />
          {diasLabel && (
            <span className="text-[11px] font-semibold tabular-nums text-[rgb(var(--primary))]">
              {diasLabel}
            </span>
          )}
        </div>
        <h2 className="mt-0.5 truncate text-sm font-semibold text-[rgb(var(--foreground))] sm:text-base">
          {titulo}
        </h2>
        <p className="mt-0.5 truncate text-xs text-[rgb(var(--foreground-muted))]">
          {meta || (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              Local a definir
            </span>
          )}
        </p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-[rgb(var(--primary))] transition-transform group-hover:translate-x-0.5" />
      <span className="sr-only">Abrir {id}</span>
    </Link>
  )
}
