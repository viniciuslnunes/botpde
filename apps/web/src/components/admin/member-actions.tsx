'use client'

import { useTransition } from 'react'
import { Check, X, RotateCcw, Loader2 } from 'lucide-react'
import { aprovarMembro, reprovarMembro, reverterMembro } from '@/app/admin/membros/actions'

interface MemberActionsProps {
  membroId: string
  status: 'PENDENTE' | 'APROVADO' | 'REPROVADO'
}

export function MemberActions({ membroId, status }: MemberActionsProps) {
  const [pending, startTransition] = useTransition()

  function handleAprovar() {
    startTransition(() => aprovarMembro(membroId))
  }

  function handleReprovar() {
    startTransition(() => reprovarMembro(membroId))
  }

  function handleReverter() {
    startTransition(() => reverterMembro(membroId))
  }

  if (pending) {
    return (
      <div className="flex items-center justify-end">
        <Loader2 className="h-4 w-4 animate-spin text-[rgb(var(--foreground-muted))]" />
      </div>
    )
  }

  if (status === 'PENDENTE') {
    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          onClick={handleAprovar}
          className="app-action flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-700"
        >
          <Check className="h-3 w-3" />
          Aprovar
        </button>
        <button
          onClick={handleReprovar}
          className="app-action flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 dark:border-red-900 dark:bg-red-950 dark:text-red-400 dark:hover:bg-red-900"
        >
          <X className="h-3 w-3" />
          Reprovar
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <button
        onClick={handleReverter}
        className="app-action flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))]"
        title="Mover de volta para pendente"
      >
        <RotateCcw className="h-3 w-3" />
        Reverter
      </button>
      {status === 'REPROVADO' && (
        <button
          onClick={handleAprovar}
          className="app-action flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-700"
        >
          <Check className="h-3 w-3" />
          Aprovar
        </button>
      )}
    </div>
  )
}
