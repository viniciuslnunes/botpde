import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { EventoTipoBadge } from '@/components/eventos/evento-tipo-badge'
import { EventoListaThumb } from '@/components/portal/eventos-list-animated'

/** Card lateral “próximo” — estilo reminder da referência. */
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
  return (
    <div className="overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface)_/_0.85)] shadow-sm backdrop-blur-sm">
      <div className="border-b border-[rgb(var(--border))] px-4 py-3">
        <p className="text-[11px] font-bold uppercase tracking-wider text-[rgb(var(--primary))]">
          Próximo compromisso
        </p>
      </div>
      <div className="space-y-3 p-4">
        <EventoListaThumb
          fotoUrl={fotoUrl}
          tipo={tipo}
          className="aspect-[5/3] h-auto w-full"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <EventoTipoBadge tipo={tipo} />
          {diasLabel && (
            <span className="rounded-full bg-[rgb(var(--primary)_/_0.12)] px-2 py-0.5 text-[11px] font-semibold text-[rgb(var(--primary))]">
              {diasLabel}
            </span>
          )}
        </div>
        <h2 className="text-base font-semibold leading-snug text-[rgb(var(--foreground))]">
          {titulo}
        </h2>
        <p className="text-xs leading-relaxed text-[rgb(var(--foreground-muted))]">
          {[dataLabel, local, lotacaoLabel].filter(Boolean).join(' · ')}
        </p>
        <Link
          href={href}
          prefetch={false}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[rgb(var(--primary))] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          Abrir evento
          <ArrowRight className="h-4 w-4" />
          <span className="sr-only">{id}</span>
        </Link>
      </div>
    </div>
  )
}
