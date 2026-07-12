'use client'

import Link from 'next/link'
import { m } from 'motion/react'
import { Video, Users } from 'lucide-react'
import { Avatar } from '@/components/portal/avatar'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { springSnappy, staggerContainer, staggerItem } from '@/lib/motion-presets'
import type { SalaAtivaListItem } from '@/lib/salas'

interface SalasListAnimatedProps {
  salas: SalaAtivaListItem[]
  canHost: boolean
}

export function SalasListAnimated({ salas, canHost }: SalasListAnimatedProps) {
  if (salas.length === 0) {
    return (
      <MotionEmptyState
        icon={
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[rgb(var(--primary)_/_0.1)]">
            <Video className="h-6 w-6 text-[rgb(var(--primary))]" />
          </div>
        }
        title="Nenhuma sala aberta agora"
        description={
          canHost
            ? 'Abra a primeira sala e chame a torcida para um encontro ao vivo.'
            : 'Assim que um anfitrião abrir uma sala, ela aparece aqui.'
        }
        className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[rgb(var(--border))] py-14 text-center"
      />
    )
  }

  return (
    <m.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="grid gap-3 sm:grid-cols-2"
    >
      {salas.map((sala) => (
        <m.div key={sala.id} variants={staggerItem} whileTap={{ scale: 0.98 }} transition={springSnappy}>
          <Link
            href={`/portal/comunidade/salas/${sala.id}`}
            className="flex h-full flex-col gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 transition-colors hover:border-[rgb(var(--primary)_/_0.5)]"
          >
            <div className="flex items-start gap-2">
              <Video className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <div className="min-w-0">
                <h3 className="truncate font-semibold text-[rgb(var(--foreground))]">{sala.titulo}</h3>
                {sala.evento && (
                  <span className="mt-1 inline-block rounded-full bg-[rgb(var(--primary)_/_0.12)] px-2 py-0.5 text-[11px] font-medium text-[rgb(var(--primary))]">
                    {sala.evento.titulo}
                  </span>
                )}
              </div>
            </div>
            <div className="mt-auto flex items-center justify-between border-t border-[rgb(var(--border))] pt-3">
              <span className="flex items-center gap-2 text-xs text-[rgb(var(--foreground-muted))]">
                <Avatar nome={sala.host.nome} avatarUrl={sala.host.avatarUrl} size="xs" />
                {sala.host.nome ?? 'Membro'}
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs text-[rgb(var(--foreground-muted))]">
                <Users className="h-3.5 w-3.5" />
                {sala._count.participantes}
              </span>
            </div>
          </Link>
        </m.div>
      ))}
    </m.div>
  )
}
