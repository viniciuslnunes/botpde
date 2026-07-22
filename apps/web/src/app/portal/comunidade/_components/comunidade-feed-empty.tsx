'use client'

import Link from 'next/link'
import { MessagesSquare } from 'lucide-react'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'

interface ComunidadeFeedEmptyProps {
  filtro: 'descobrir' | 'seguindo' | 'grupos' | 'canal'
  /** Empty copy da Comunidade Nacional (feed por afiliação). */
  nacional?: boolean
}

export function ComunidadeFeedEmpty({ filtro, nacional = false }: ComunidadeFeedEmptyProps) {
  if (filtro === 'canal') {
    return (
      <MotionEmptyState
        icon={<MessagesSquare className="mb-3 h-9 w-9 text-[rgb(var(--foreground-muted))]" />}
        title="Nenhuma publicação ainda"
        description="Seja o primeiro a publicar neste canal."
      />
    )
  }

  if (nacional) {
    return (
      <MotionEmptyState
        icon={<MessagesSquare className="mb-3 h-9 w-9 text-[rgb(var(--foreground-muted))]" />}
        title="O feed nacional começa com você"
        description="As torcidas ainda não publicaram posts públicos por aqui. Publique a primeira mensagem para a comunidade do clube."
      />
    )
  }

  return (
    <MotionEmptyState
      icon={<MessagesSquare className="mb-3 h-9 w-9 text-[rgb(var(--foreground-muted))]" />}
      title={filtro === 'seguindo' ? 'Nada de quem você segue ainda' : 'O feed começa com você'}
      description={
        filtro === 'seguindo' ? (
          <>
            Siga membros da torcida para ver as publicações deles aqui, ou volte para{' '}
            <Link href="/portal/comunidade" className="font-medium text-[rgb(var(--color-primary-fg))] hover:underline">
              Descobrir
            </Link>
            .
          </>
        ) : (
          'Publique a primeira mensagem ou siga outros membros para ver o que a torcida está falando.'
        )
      }
    />
  )
}
