'use client'

import Link from 'next/link'
import { MessagesSquare } from 'lucide-react'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'

interface ComunidadeFeedEmptyProps {
  filtro: 'descobrir' | 'seguindo'
}

export function ComunidadeFeedEmpty({ filtro }: ComunidadeFeedEmptyProps) {
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
