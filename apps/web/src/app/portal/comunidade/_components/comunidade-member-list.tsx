'use client'

import Link from 'next/link'
import { m } from 'motion/react'
import { Avatar } from '@/components/portal/avatar'
import { SeguimentoButtons } from '@/components/portal/seguimento-buttons'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { fadeUp, springSnappy, staggerContainer, staggerItem } from '@/lib/motion-presets'

type SeguimentoStatus = 'PENDENTE' | 'APROVADO' | 'REJEITADO' | 'BLOQUEADO' | null

export interface ComunidadeMemberListItem {
  userId: string
  nome: string | null
  avatarUrl: string | null
  segueVoce?: boolean
}

interface ComunidadeMemberListProps {
  membros: ComunidadeMemberListItem[]
  statuses: SeguimentoStatus[]
  currentUserId: string
  podeVer: boolean
  emptyTitle: string
  privadoMessage?: string
}

export function ComunidadeMemberList({
  membros,
  statuses,
  currentUserId,
  podeVer,
  emptyTitle,
  privadoMessage = 'Lista privada.',
}: ComunidadeMemberListProps) {
  if (!podeVer) {
    return (
      <m.p
        variants={fadeUp}
        initial="hidden"
        animate="show"
        transition={springSnappy}
        className="text-sm text-[rgb(var(--foreground-muted))]"
      >
        {privadoMessage}
      </m.p>
    )
  }

  if (membros.length === 0) {
    return (
      <MotionEmptyState
        className="rounded-xl border border-dashed border-[rgb(var(--border))] px-4 py-10 text-center text-sm text-[rgb(var(--foreground-muted))]"
        title={emptyTitle}
      />
    )
  }

  return (
    <m.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="space-y-2"
    >
      {membros.map((membro, i) => (
        <m.div
          key={membro.userId}
          variants={staggerItem}
          layout
          className="flex items-center justify-between gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3"
        >
          <Link
            href={`/portal/comunidade/perfil/${membro.userId}`}
            className="flex min-w-0 items-center gap-3"
          >
            <Avatar nome={membro.nome} avatarUrl={membro.avatarUrl} size="md" />
            <div>
              <p className="truncate text-sm font-semibold">{membro.nome ?? 'Membro'}</p>
              {membro.segueVoce && (
                <p className="text-[11px] text-[rgb(var(--foreground-muted))]">Segue você</p>
              )}
            </div>
          </Link>
          {membro.userId !== currentUserId && (
            <SeguimentoButtons userId={membro.userId} status={statuses[i] ?? null} />
          )}
        </m.div>
      ))}
    </m.div>
  )
}
