import Link from 'next/link'
import { Users, Video } from 'lucide-react'
import type { SalaAtivaListItem } from '@/lib/salas'

interface ComunidadeSalasPanelProps {
  salas: SalaAtivaListItem[]
}

export function ComunidadeSalasPanel({ salas }: ComunidadeSalasPanelProps) {
  return (
    <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[rgb(var(--foreground))]">
          {salas.length > 0 && (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
          )}
          Salas ao vivo
        </h2>
        <Link
          href="/portal/comunidade/salas"
          className="text-xs font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
        >
          Ver todas
        </Link>
      </div>

      {salas.length === 0 ? (
        <p className="text-xs text-[rgb(var(--foreground-muted))]">
          Nenhuma sala ao vivo no momento.
        </p>
      ) : (
        <div className="space-y-2">
          {salas.slice(0, 3).map((sala) => (
            <Link
              key={sala.id}
              href={`/portal/comunidade/salas/${sala.id}`}
              className="block rounded-xl border border-[rgb(var(--border))] p-3 transition-colors hover:border-[rgb(var(--color-primary)_/_0.5)] hover:bg-[rgb(var(--background-subtle))]"
            >
              <div className="flex items-center gap-2">
                <Video className="h-3.5 w-3.5 shrink-0 text-red-500" />
                <p className="truncate text-sm font-medium text-[rgb(var(--foreground))]">
                  {sala.titulo}
                </p>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="inline-flex items-center gap-1 text-[11px] text-[rgb(var(--foreground-muted))]">
                  <Users className="h-3 w-3" />
                  {sala._count.participantes} online
                </span>
                <span className="rounded-full bg-[rgb(var(--color-primary)_/_0.14)] px-2.5 py-0.5 text-[10px] font-semibold text-[rgb(var(--color-primary-fg))] ring-1 ring-inset ring-[rgb(var(--color-primary)_/_0.35)]">
                  Entrar
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
