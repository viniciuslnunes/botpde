'use client'

import { useId, type ReactNode } from 'react'
import type { ConfirmVariant } from '@torcida/ui'
import { runPersistAction, toastFromAction, type ActionLike } from '@/lib/toast-action'
import { useConfirmDialog } from '@/lib/confirm-action'
import { useTrackedForm } from '@/lib/unsaved-changes'

export type AdminActionConfirm = {
  titulo: string
  descricao?: string
  labelConfirmar?: string
  labelCancelar?: string
  variante?: ConfirmVariant
  cancelled?: string | false
}

type Props = {
  /** Server Action (FormData) — throw ou ActionLike. */
  action: (formData: FormData) => Promise<unknown>
  success: string
  errorFallback?: string
  /** Quando a action devolve ActionLike (`{ success }` / `{ error }`). */
  interpretResult?: boolean
  /** Confirmação modal antes de persistir (admin / departamentos). */
  confirm?: AdminActionConfirm
  className?: string
  children: ReactNode
  /** Título no modal de alterações não salvas. */
  unsavedTitle?: string
  unsavedId?: string
  unsavedLabels?: Record<string, string>
}

/**
 * Form client para páginas RSC do admin: dispara toast de sucesso/erro
 * após a Server Action persistir. Rastrea alterações não salvas.
 */
export function AdminActionForm({
  action,
  success,
  errorFallback,
  interpretResult = false,
  confirm: confirmOpts,
  className,
  children,
  unsavedTitle = 'Formulário',
  unsavedId,
  unsavedLabels,
}: Props) {
  const reactId = useId()
  const confirmDialog = useConfirmDialog()
  const { formRef, markPristine } = useTrackedForm({
    id: unsavedId ?? `admin-action-form-${reactId}`,
    title: unsavedTitle,
    labels: unsavedLabels,
  })

  async function runMutation(formData: FormData): Promise<boolean> {
    if (interpretResult) {
      const result = await action(formData)
      return toastFromAction(result as ActionLike, {
        success,
        errorFallback,
      })
    }
    return runPersistAction(() => action(formData), {
      success,
      errorFallback,
    })
  }

  return (
    <form
      ref={formRef}
      className={className}
      action={async (formData) => {
        if (confirmOpts) {
          const ok = await confirmDialog({
            titulo: confirmOpts.titulo,
            descricao: confirmOpts.descricao,
            labelConfirmar: confirmOpts.labelConfirmar,
            labelCancelar: confirmOpts.labelCancelar,
            variante: confirmOpts.variante,
            cancelled: confirmOpts.cancelled,
            execute: () => runMutation(formData),
          })
          if (ok) markPristine()
          return
        }

        const ok = await runMutation(formData)
        if (ok) markPristine()
      }}
    >
      {children}
    </form>
  )
}
