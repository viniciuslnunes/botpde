import Link from 'next/link'
import { Users, Video } from 'lucide-react'
import type { SalaAtivaListItem } from '@/lib/salas'

interface ComunidadeSalasLiveWidgetProps {
  salas: SalaAtivaListItem[]
  limite?: number
}

export function ComunidadeSalasLiveWidget({ salas, limite = 2 }: ComunidadeSalasLiveWidgetProps) {
  if (salas.length === 0) return null

  return (
    <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[rgb(var(--foreground))]">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
          Ao vivo agora
        </h2>
        <Link
          href="/portal/comunidade/salas"
          className="text-xs font-medium text-[rgb(var(--primary))] hover:underline"
        >
          Ver todas
        </Link>
      </div>
      <div className="space-y-2">
        {salas.slice(0, limite).map((sala) => (
          <Link
            key={sala.id}
            href={`/portal/comunidade/salas/${sala.id}`}
            className="flex items-center justify-between gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2.5 transition-colors hover:border-[rgb(var(--primary)_/_0.5)]"
          >
            <div className="flex min-w-0 items-center gap-2">
              <Video className="h-4 w-4 shrink-0 text-red-500" />
              <p className="truncate text-sm font-medium text-[rgb(var(--foreground))]">
                {sala.titulo}
              </p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 text-xs text-[rgb(var(--foreground-muted))]">
              <Users className="h-3.5 w-3.5" />
              {sala._count.participantes}
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
