'use client'

import { useTransition } from 'react'
import { aprovarSeguimento, rejeitarSeguimento, solicitarSeguir } from '@/app/portal/comunidade/actions'

type SeguimentoStatus = 'PENDENTE' | 'APROVADO' | 'REJEITADO' | 'BLOQUEADO' | null

interface FollowModeProps {
  mode: 'follow'
  userId: string
  status: SeguimentoStatus
  isSelf?: boolean
}

interface ReviewModeProps {
  mode: 'review'
  seguimentoId: string
}

type Props = FollowModeProps | ReviewModeProps

export function SeguimentoButtons(props: Props) {
  const [pending, startTransition] = useTransition()

  if (props.mode === 'review') {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => aprovarSeguimento(props.seguimentoId))}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          Aprovar
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => rejeitarSeguimento(props.seguimentoId))}
          className="rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-semibold text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] disabled:opacity-60"
        >
          Rejeitar
        </button>
      </div>
    )
  }

  if (props.isSelf) return null

  if (props.status === 'APROVADO') {
    return (
      <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
        Seguindo
      </span>
    )
  }

  if (props.status === 'PENDENTE') {
    return (
      <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-900 dark:text-amber-200">
        Solicitação pendente
      </span>
    )
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => solicitarSeguir(props.userId))}
      className="rounded-lg bg-[rgb(var(--primary))] px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      Seguir
    </button>
  )
}
