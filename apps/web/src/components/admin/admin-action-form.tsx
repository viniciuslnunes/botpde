'use client'

import { useId, type ReactNode } from 'react'
import { runPersistAction, toastFromAction, type ActionLike } from '@/lib/toast-action'
import { useTrackedForm } from '@/lib/unsaved-changes'

type Props = {
  /** Server Action (FormData) — throw ou ActionLike. */
  action: (formData: FormData) => Promise<unknown>
  success: string
  errorFallback?: string
  /** Quando a action devolve ActionLike (`{ success }` / `{ error }`). */
  interpretResult?: boolean
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
  className,
  children,
  unsavedTitle = 'Formulário',
  unsavedId,
  unsavedLabels,
}: Props) {
  const reactId = useId()
  const { formRef, markPristine } = useTrackedForm({
    id: unsavedId ?? `admin-action-form-${reactId}`,
    title: unsavedTitle,
    labels: unsavedLabels,
  })

  return (
    <form
      ref={formRef}
      className={className}
      action={async (formData) => {
        if (interpretResult) {
          const result = await action(formData)
          const ok = toastFromAction(result as ActionLike, {
            success,
            errorFallback,
          })
          if (ok) markPristine()
          return
        }
        const ok = await runPersistAction(() => action(formData), {
          success,
          errorFallback,
        })
        if (ok) markPristine()
      }}
    >
      {children}
    </form>
  )
}
