'use client'

import { useCallback } from 'react'
import { useDialog, type ConfirmOptions } from '@torcida/ui/services/dialog'
import { toast } from '@torcida/ui/services/toast'
import { runPersistAction, type PersistToastLabels } from '@/lib/toast-action'

export type ConfirmDialogRequest = ConfirmOptions & {
  /**
   * Toast ao cancelar pelo botão.
   * Escape/backdrop são silenciosos por padrão (menos ruído).
   * `false` desliga. Default: "Ação cancelada."
   */
  cancelled?: string | false
  /** Se true, também toasta ao fechar com Escape/backdrop. */
  cancelledToastOnDismiss?: boolean
}

export type ConfirmActionRequest = Omit<ConfirmDialogRequest, 'execute'> & {
  /** Mutação executada no próprio modal (loading no botão Confirmar). */
  run: () => Promise<unknown>
} & PersistToastLabels

/**
 * Modal de confirmação de ação (aprovar, excluir, aceitar…).
 * Separado do unsaved-changes (navegação com formulário dirty).
 *
 * Toast de cancelamento só no botão Cancelar (Escape/backdrop silenciosos).
 */
export function useConfirmDialog() {
  const { confirm } = useDialog()

  return useCallback(
    async (opts: ConfirmDialogRequest): Promise<boolean> => {
      return confirm({
        titulo: opts.titulo,
        descricao: opts.descricao,
        labelConfirmar: opts.labelConfirmar,
        labelCancelar: opts.labelCancelar,
        variante: opts.variante,
        execute: opts.execute,
        onDismiss: (reason) => {
          if (opts.cancelled === false) return
          if (reason === 'dismiss' && !opts.cancelledToastOnDismiss) return
          toast.message(opts.cancelled ?? 'Ação cancelada.')
        },
      })
    },
    [confirm],
  )
}

/**
 * Confirma → executa mutação *dentro* do modal (loading) → toast sucesso/erro.
 * Preferir este helper para mutações: o botão de origem não some atrás de spinner.
 */
export function useConfirmAction() {
  const confirmDialog = useConfirmDialog()

  return useCallback(
    async (opts: ConfirmActionRequest): Promise<boolean> => {
      return confirmDialog({
        titulo: opts.titulo,
        descricao: opts.descricao,
        labelConfirmar: opts.labelConfirmar,
        labelCancelar: opts.labelCancelar,
        variante: opts.variante,
        cancelled: opts.cancelled,
        cancelledToastOnDismiss: opts.cancelledToastOnDismiss,
        execute: () =>
          runPersistAction(opts.run, {
            success: opts.success,
            successDescription: opts.successDescription,
            errorFallback: opts.errorFallback,
            action: opts.action,
            id: opts.id,
          }),
      })
    },
    [confirmDialog],
  )
}
