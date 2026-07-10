import Link from 'next/link'
import { Users, Video } from 'lucide-react'
import { listSalasAtivas } from '@/lib/salas'
import type { SalaAtivaListItem } from '@/lib/salas'

function MobileLiveSalas({ salas }: { salas: SalaAtivaListItem[] }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
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
      <div className="grid gap-3 sm:grid-cols-2">
        {salas.slice(0, 2).map((sala) => (
          <Link
            key={sala.id}
            href={`/portal/comunidade/salas/${sala.id}`}
            className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3.5 transition-colors hover:border-[rgb(var(--primary)_/_0.5)]"
          >
            <div className="flex items-center gap-2">
              <Video className="h-4 w-4 shrink-0 text-red-500" />
              <p className="truncate text-sm font-semibold text-[rgb(var(--foreground))]">
                {sala.titulo}
              </p>
            </div>
            <div className="mt-2.5 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs text-[rgb(var(--foreground-muted))]">
                <Users className="h-3.5 w-3.5" />
                {sala._count.participantes} online
              </span>
              <span className="rounded-full bg-[rgb(var(--primary))] px-3 py-1 text-xs font-semibold text-white">
                Entrar
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}

interface ComunidadeSalasMobileProps {
  tenantId: string
}

export async function ComunidadeSalasMobile({ tenantId }: ComunidadeSalasMobileProps) {
  const salas = await listSalasAtivas(tenantId)
  if (salas.length === 0) return null
  return (
    <div className="xl:hidden">
      <MobileLiveSalas salas={salas} />
    </div>
  )
}
