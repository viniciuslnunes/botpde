'use client'

import { useTransition } from 'react'
import { Loader2, Undo2 } from 'lucide-react'
import { toast } from '@torcida/ui'
import { desfazerImportacao } from '@/app/admin/membros/importar/actions'

/** Desfaz uma importação MOCK (remove membros + users mock órfãos). */
export function UndoImportButton({ importacaoId }: { importacaoId: string }) {
  const [pending, startTransition] = useTransition()

  function handleUndo() {
    toast.confirm('Desfazer esta importação?', {
      description: 'Os membros mock criados por ela serão removidos.',
      confirmLabel: 'Desfazer',
      cancelLabel: 'Manter',
      onConfirm: () => {
        startTransition(async () => {
          try {
            const result = await toast
              .promise(
                desfazerImportacao(importacaoId).then((data) => {
                  if (!data.success) {
                    throw new Error(data.error ?? 'Não foi possível desfazer a importação.')
                  }
                  return data
                }),
                {
                  loading: 'Desfazendo importação…',
                  success: (data) =>
                    `Importação desfeita · ${data.importados ?? 0} membros removidos.`,
                  error: (err) =>
                    err instanceof Error ? err.message : 'Não foi possível desfazer.',
                  id: `undo-import-${importacaoId}`,
                },
              )
              .unwrap()
            void result
          } catch {
            // erro já no toast.promise
          }
        })
      },
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
