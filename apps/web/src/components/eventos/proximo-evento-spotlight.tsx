import Link from 'next/link'
import { ArrowRight, Bus, CalendarDays, Clock, Drum, MapPin, Users } from 'lucide-react'
import { EventoTipoBadge } from '@/components/eventos/evento-tipo-badge'

function TipoIcon({ tipo }: { tipo: string }) {
  if (tipo === 'CARAVANA') return <Bus className="h-5 w-5" aria-hidden />
  if (tipo === 'ENSAIO') return <Drum className="h-5 w-5" aria-hidden />
  return <CalendarDays className="h-5 w-5" aria-hidden />
}

function tipoTone(tipo: string) {
  if (tipo === 'CARAVANA') {
    return {
      band: 'from-amber-500/20 via-amber-500/8 to-transparent',
      icon: 'bg-amber-500/15 text-amber-800 ring-amber-500/30 dark:text-amber-300',
    }
  }
  if (tipo === 'ENSAIO') {
    return {
      band: 'from-sky-500/20 via-sky-500/8 to-transparent',
      icon: 'bg-sky-500/15 text-sky-800 ring-sky-500/30 dark:text-sky-300',
    }
  }
  return {
    band: 'from-[rgb(var(--color-primary)_/_0.22)] via-[rgb(var(--color-primary)_/_0.08)] to-transparent',
    icon: 'bg-[rgb(var(--color-primary)_/_0.14)] text-[rgb(var(--color-primary-fg))] ring-[rgb(var(--color-primary)_/_0.3)]',
  }
}

/** Destaque do próximo evento — denso, legível sem foto e usable em aside ou full-width. */
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
  const tone = tipoTone(tipo)

  return (
    <article className="overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface)_/_0.85)] shadow-sm backdrop-blur-sm">
      <div className="flex items-center justify-between gap-2 border-b border-[rgb(var(--border))] px-4 py-2.5">
        <p className="text-[11px] font-bold uppercase tracking-wider text-[rgb(var(--color-primary-fg))]">
          Próximo compromisso
        </p>
        {diasLabel ? (
          <span className="shrink-0 rounded-md bg-[rgb(var(--color-primary)_/_0.14)] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[rgb(var(--color-primary-fg))] ring-1 ring-inset ring-[rgb(var(--color-primary)_/_0.35)]">
            {diasLabel}
          </span>
        ) : null}
      </div>

      {fotoUrl ? (
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-[rgb(var(--background-subtle))]">
          {/* eslint-disable-next-line @next/next/no-img-element -- capas externas */}
          <img
            src={fotoUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="eager"
            decoding="async"
          />
          <div className="absolute left-3 top-3">
            <EventoTipoBadge tipo={tipo} />
          </div>
        </div>
      ) : (
        <div className={`flex items-center gap-3 bg-gradient-to-r px-4 py-3.5 ${tone.band}`}>
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${tone.icon}`}
          >
            <TipoIcon tipo={tipo} />
          </div>
          <EventoTipoBadge tipo={tipo} />
        </div>
      )}

      <div className="space-y-3.5 p-4">
        <h2 className="text-balance text-base font-semibold leading-snug text-[rgb(var(--foreground))] sm:text-lg">
          {titulo}
        </h2>

        <ul className="space-y-2 text-sm text-[rgb(var(--foreground-muted))]">
          <li className="flex items-start gap-2">
            <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="min-w-0 leading-snug">{dataLabel}</span>
          </li>
          {local ? (
            <li className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="min-w-0 leading-snug">{local}</span>
            </li>
          ) : null}
          {lotacaoLabel ? (
            <li className="flex items-start gap-2">
              <Users className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="min-w-0 leading-snug">{lotacaoLabel}</span>
            </li>
          ) : null}
        </ul>

        <Link
          href={href}
          prefetch={false}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[rgb(var(--color-primary))] px-4 py-2.5 text-sm font-semibold text-[rgb(var(--color-primary-on))] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-primary))] focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--surface))]"
        >
          Abrir evento
          <ArrowRight className="h-4 w-4" aria-hidden />
          <span className="sr-only">({id})</span>
        </Link>
      </div>
    </article>
  )
}
