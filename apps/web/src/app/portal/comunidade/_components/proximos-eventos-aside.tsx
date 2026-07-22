import Link from 'next/link'
import { Calendar } from 'lucide-react'
import { diasParaEvento, type ProximoEventoItem } from '@/lib/eventos'

function formatarDataEvento(data: Date) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(data),
  )
}

export function ProximosEventosAside({ eventos }: { eventos: ProximoEventoItem[] }) {
  if (eventos.length === 0) return null

  return (
    <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-[rgb(var(--foreground))]">
        <Calendar className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
        Próximos eventos
      </h2>
      <div className="mt-3 space-y-3">
        {eventos.map((evento) => {
          const href = `/portal/eventos/${evento.id}`
          return (
            <div key={evento.id} className="flex items-center gap-2">
              <Link href={href} className="shrink-0">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[rgb(var(--color-primary)_/_0.12)]">
                  <Calendar className="h-3.5 w-3.5 text-[rgb(var(--color-primary-fg))]" />
                </span>
              </Link>
              <Link href={href} className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-[rgb(var(--foreground))] hover:underline">
                  {evento.titulo}
                </p>
                <p className="truncate text-[10px] text-[rgb(var(--foreground-muted))]">
                  {diasParaEvento(evento.data)}
                  {' · '}
                  {formatarDataEvento(evento.data)}
                  {evento.local ? ` · ${evento.local}` : null}
                </p>
              </Link>
              <Link
                href={href}
                className="shrink-0 rounded-lg border border-[rgb(var(--border))] px-2.5 py-1 text-[10px] font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
              >
                Ver
              </Link>
            </div>
          )
        })}
      </div>
      <Link
        href="/portal/eventos"
        className="mt-3 flex w-full items-center justify-center rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-xs font-semibold text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
      >
        Ver eventos
      </Link>
    </div>
  )
}
