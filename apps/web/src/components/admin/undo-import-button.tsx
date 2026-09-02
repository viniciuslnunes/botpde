'use client'

import { Undo2 } from 'lucide-react'
import { desfazerImportacao } from '@/app/admin/membros/importar/actions'
import { useConfirmAction } from '@/lib/confirm-action'
import { AppButton } from '@/components/ui/button'

/** Desfaz uma importação MOCK (remove membros + users mock órfãos). */
export function UndoImportButton({ importacaoId }: { importacaoId: string }) {
  const confirmAction = useConfirmAction()

  function handleUndo() {
    void confirmAction({
      titulo: 'Desfazer esta importação?',
      descricao: 'Os membros mock criados por ela serão removidos.',
      labelConfirmar: 'Desfazer',
      labelCancelar: 'Manter',
      variante: 'destructive',
      cancelled: 'Desfazer cancelado.',
      run: async () => {
        const data = await desfazerImportacao(importacaoId)
        if (!data.success) {
          throw new Error(data.error ?? 'Não foi possível desfazer a importação.')
        }
        return data
      },
      success: 'Importação desfeita.',
      id: `undo-import-${importacaoId}`,
    })
  }

  return (
    <AppButton
      variant="none"
      icon={Undo2}
      onClick={handleUndo}
      className="flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:text-red-600 disabled:opacity-50"
      title="Remove os membros criados por esta importação"
    >
      Desfazer
    </AppButton>
  )
}
