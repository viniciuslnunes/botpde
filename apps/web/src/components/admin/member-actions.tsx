'use client'

import { Check, X, RotateCcw } from 'lucide-react'
import { aprovarMembro, reprovarMembro, reverterMembro } from '@/app/admin/membros/actions'
import { useConfirmAction } from '@/lib/confirm-action'

interface MemberActionsProps {
  membroId: string
  status: 'PENDENTE' | 'APROVADO' | 'REPROVADO'
}

export function MemberActions({ membroId, status }: MemberActionsProps) {
  const confirmAction = useConfirmAction()

  async function handleAprovar() {
    await confirmAction({
      titulo: 'Aprovar este membro?',
      descricao: 'A pessoa passa a ter acesso conforme o status de sócio/torcedor aprovado.',
      labelConfirmar: 'Aprovar',
      variante: 'success',
      cancelled: 'Aprovação cancelada.',
      run: () => aprovarMembro(membroId),
      success: 'Membro aprovado.',
    })
  }

  async function handleReprovar() {
    await confirmAction({
      titulo: 'Reprovar este membro?',
      descricao: 'A solicitação será marcada como reprovada.',
      labelConfirmar: 'Reprovar',
      variante: 'destructive',
      cancelled: 'Reprovação cancelada.',
      run: () => reprovarMembro(membroId),
      success: 'Membro reprovado.',
    })
  }

  async function handleReverter() {
    await confirmAction({
      titulo: 'Reverter para pendente?',
      descricao: 'O membro volta à fila de solicitação.',
      labelConfirmar: 'Reverter',
      cancelled: 'Reversão cancelada.',
      run: () => reverterMembro(membroId),
      success: 'Membro movido para pendente.',
    })
  }

  if (status === 'PENDENTE') {
    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          onClick={() => void handleAprovar()}
          className="app-action flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-700"
        >
          <Check className="h-3 w-3" />
          Aprovar
        </button>
        <button
          onClick={() => void handleReprovar()}
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
        onClick={() => void handleReverter()}
        className="app-action flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))]"
        title="Mover de volta para pendente"
      >
        <RotateCcw className="h-3 w-3" />
        Reverter
      </button>
      {status === 'REPROVADO' && (
        <button
          onClick={() => void handleAprovar()}
          className="app-action flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-700"
        >
          <Check className="h-3 w-3" />
          Aprovar
        </button>
      )}
    </div>
  )
}
