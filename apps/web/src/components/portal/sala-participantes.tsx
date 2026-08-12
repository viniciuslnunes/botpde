'use client'

import { memo } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { Crown, User, Users } from 'lucide-react'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { AvatarFoto } from '@/components/media/avatar-foto'
import { staggerContainer, staggerItem } from '@/lib/motion-presets'
import type { ParticipanteSala } from '@/lib/sala-participantes-client'

export type { ParticipanteSala } from '@/lib/sala-participantes-client'

interface SalaParticipantesProps {
  participantes: ParticipanteSala[]
  glass?: boolean
}

const Avatar = memo(function Avatar({
  nome,
  avatarUrl,
}: {
  nome: string | null
  avatarUrl: string | null
}) {
  if (avatarUrl) {
    return (
      <AvatarFoto
        src={avatarUrl}
        alt={nome ?? 'Membro'}
        px={36}
        referrerPolicy="no-referrer"
        className="h-9 w-9 rounded-full object-cover ring-2 ring-[rgb(var(--border))]"
      />
    )
  }

  const inicial = (nome?.trim()?.[0] ?? '?').toUpperCase()
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[rgb(var(--background-subtle))] text-sm font-semibold text-[rgb(var(--foreground-muted))] ring-2 ring-[rgb(var(--border))]">
      {inicial}
    </div>
  )
})

export function SalaParticipantes({
  participantes,
  glass = false,
}: SalaParticipantesProps) {
  return (
    <div className={glass ? 'text-white' : undefined}>
      <p className={`mb-3 text-xs ${glass ? 'text-zinc-300' : 'text-[rgb(var(--foreground-muted))]'}`}>
        {participantes.length} online agora
      </p>

      {participantes.length === 0 ? (
        <MotionEmptyState
          icon={
            <Users
              className={`mb-2 h-6 w-6 ${glass ? 'text-zinc-400' : 'text-[rgb(var(--foreground-muted))]'}`}
            />
          }
          title="Ninguém online no momento"
          className={`py-4 text-center ${glass ? 'text-zinc-300' : ''}`}
        />
      ) : (
        <m.ul variants={staggerContainer} initial="hidden" animate="show" className="space-y-2">
          <AnimatePresence mode="popLayout">
            {participantes.map((p) => (
              <m.li
                key={p.userId}
                layout
                variants={staggerItem}
                className={
                  glass
                    ? 'flex items-center gap-3 rounded-xl border border-white/10 bg-white/10 px-3 py-2'
                    : 'flex items-center gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2'
                }
              >
                <Avatar nome={p.nome} avatarUrl={p.avatarUrl} />
                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate text-sm font-medium ${glass ? 'text-zinc-50' : 'text-[rgb(var(--foreground))]'}`}
                  >
                    {p.nome ?? 'Membro'}
                  </p>
                  <p className={`text-xs ${glass ? 'text-zinc-300' : 'text-[rgb(var(--foreground-muted))]'}`}>
                    {p.papel === 'HOST' ? 'Anfitrião' : 'Participante'}
                  </p>
                </div>
                {p.papel === 'HOST' ? (
                  <Crown className="h-4 w-4 shrink-0 text-amber-500" aria-label="Anfitrião" />
                ) : (
                  <User
                    className={`h-4 w-4 shrink-0 ${glass ? 'text-zinc-400' : 'text-[rgb(var(--foreground-muted))]'}`}
                    aria-hidden
                  />
                )}
              </m.li>
            ))}
          </AnimatePresence>
        </m.ul>
      )}
    </div>
  )
}
