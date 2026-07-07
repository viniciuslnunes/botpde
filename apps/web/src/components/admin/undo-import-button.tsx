'use client'

import { useTransition } from 'react'
import { Loader2, Undo2 } from 'lucide-react'
import { desfazerImportacao } from '@/app/admin/membros/importar/actions'

/** Desfaz uma importação MOCK (remove membros + users mock órfãos). */
export function UndoImportButton({ importacaoId }: { importacaoId: string }) {
  const [pending, startTransition] = useTransition()

  function handleUndo() {
    if (!window.confirm('Desfazer esta importação? Os membros mock criados por ela serão removidos.')) return
    startTransition(async () => {
      await desfazerImportacao(importacaoId)
    })
  }

  return (
    <button
      onClick={handleUndo}
      disabled={pending}
      className="flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:text-red-600 disabled:opacity-50"
      title="Remove os membros criados por esta importação"
    >
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}
      Desfazer
    </button>
  )
}
