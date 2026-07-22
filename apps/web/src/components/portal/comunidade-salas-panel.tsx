import Link from 'next/link'
import { Users, Video } from 'lucide-react'
import type { SalaAtivaListItem } from '@/lib/salas'

interface ComunidadeSalasPanelProps {
  salas: SalaAtivaListItem[]
  titulo?: string
  limite?: number
  footerHref?: string
  footerLabel?: string
  /** Quando false, não renderiza se não houver salas (ex.: widget "Ao vivo agora"). */
  mostrarQuandoVazio?: boolean
}

export function ComunidadeSalasPanel({
  salas,
  titulo = 'Salas ao vivo',
  limite = 4,
  footerHref = '/portal/comunidade/salas',
  footerLabel = 'Ver salas',
  mostrarQuandoVazio = true,
}: ComunidadeSalasPanelProps) {
  if (!mostrarQuandoVazio && salas.length === 0) return null

  const visiveis = salas.slice(0, limite)

  return (
    <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-[rgb(var(--foreground))]">
        <Video className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
        {titulo}
      </h2>

      {visiveis.length === 0 ? (
        <p className="mt-3 text-xs text-[rgb(var(--foreground-muted))]">
          Nenhuma sala ao vivo no momento.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {visiveis.map((sala) => {
            const href = `/portal/comunidade/salas/${sala.id}`
            return (
              <div key={sala.id} className="flex items-center gap-2">
                <Link href={href} className="shrink-0 cursor-pointer">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500/10">
                    <Video className="h-3.5 w-3.5 text-red-500" />
                  </span>
                </Link>
                <Link
                  href={href}
                  className="min-w-0 flex-1 cursor-pointer hover:underline"
                >
                  <p className="truncate text-xs font-medium text-[rgb(var(--foreground))]">
                    {sala.titulo}
                  </p>
                  <p className="truncate text-[10px] text-[rgb(var(--foreground-muted))]">
                    <span className="inline-flex items-center gap-0.5">
                      <Users className="h-2.5 w-2.5" />
                      {sala._count.participantes}
                    </span>
                    {' · '}
                    online
                  </p>
                </Link>
                <Link
                  href={href}
                  className="shrink-0 cursor-pointer rounded-lg border border-[rgb(var(--border))] px-2.5 py-1 text-[10px] font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
                >
                  Entrar
                </Link>
              </div>
            )
          })}
        </div>
      )}

      <Link
        href={footerHref}
        className="mt-3 flex w-full cursor-pointer items-center justify-center rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-xs font-semibold text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
      >
        {footerLabel}
      </Link>
    </div>
  )
}
