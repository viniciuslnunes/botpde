'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { Crown, Loader2, User, Users } from 'lucide-react'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { staggerContainer, staggerItem } from '@/lib/motion-presets'

export type ParticipanteSala = {
  userId: string
  nome: string | null
  avatarUrl: string | null
  papel: 'HOST' | 'MODERADOR' | 'PARTICIPANTE'
  entrouEm: string
}

interface SalaParticipantesProps {
  salaId: string
  initialParticipantes: ParticipanteSala[]
  onCountChange?: (count: number) => void
}

function Avatar({ nome, avatarUrl }: { nome: string | null; avatarUrl: string | null }) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={nome ?? 'Membro'}
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
}

export function SalaParticipantes({
  salaId,
  initialParticipantes,
  onCountChange,
}: SalaParticipantesProps) {
  const [participantes, setParticipantes] = useState(initialParticipantes)
  const [carregando, setCarregando] = useState(false)

  useEffect(() => {
    onCountChange?.(participantes.length)
  }, [participantes.length, onCountChange])

  useEffect(() => {
    let active = true

    async function poll() {
      if (document.visibilityState !== 'visible') return
      setCarregando(true)
      try {
        const res = await fetch(`/api/salas/${salaId}/participantes`, { cache: 'no-store' })
        if (!res.ok || !active) return
        const data = (await res.json()) as {
          participantes?: ParticipanteSala[]
          total?: number
        }
        if (data.participantes) {
          setParticipantes(
            data.participantes.map((p) => ({
              ...p,
              entrouEm:
                typeof p.entrouEm === 'string' ? p.entrouEm : new Date(p.entrouEm).toISOString(),
            })),
          )
          if (typeof data.total === 'number') onCountChange?.(data.total)
        }
      } catch {
        // polling silencioso
      } finally {
        if (active) setCarregando(false)
      }
    }

    void poll()
    const id = window.setInterval(poll, 15000)
    return () => {
      active = false
      window.clearInterval(id)
    }
  }, [salaId, onCountChange])

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-[rgb(var(--foreground-muted))]">
          {participantes.length} online agora
        </p>
        {carregando && <Loader2 className="h-3.5 w-3.5 animate-spin text-[rgb(var(--foreground-muted))]" />}
      </div>

      {participantes.length === 0 ? (
        <MotionEmptyState
          icon={<Users className="mb-2 h-6 w-6 text-[rgb(var(--foreground-muted))]" />}
          title="Ninguém online no momento"
          className="py-4 text-center"
        />
      ) : (
        <m.ul variants={staggerContainer} initial="hidden" animate="show" className="space-y-2">
          <AnimatePresence mode="popLayout">
            {participantes.map((p) => (
              <m.li
                key={p.userId}
                layout
                variants={staggerItem}
                className="flex items-center gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2"
              >
              <Avatar nome={p.nome} avatarUrl={p.avatarUrl} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[rgb(var(--foreground))]">
                  {p.nome ?? 'Membro'}
                </p>
                <p className="text-xs text-[rgb(var(--foreground-muted))]">
                  {p.papel === 'HOST' ? 'Anfitrião' : 'Participante'}
                </p>
              </div>
              {p.papel === 'HOST' && (
                <Crown className="h-4 w-4 shrink-0 text-amber-500" aria-label="Anfitrião" />
              )}
              {p.papel !== 'HOST' && (
                <User className="h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))]" aria-hidden />
              )}
            </m.li>
            ))}
          </AnimatePresence>
        </m.ul>
      )}
    </div>
  )
}
