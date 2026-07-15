'use client'

import type { ReactNode } from 'react'
import { runPersistAction, toastFromAction, type ActionLike } from '@/lib/toast-action'

type Props = {
  /** Server Action (FormData) — throw ou ActionLike. */
  action: (formData: FormData) => Promise<unknown>
  success: string
  errorFallback?: string
  /** Quando a action devolve ActionLike (`{ success }` / `{ error }`). */
  interpretResult?: boolean
  className?: string
  children: ReactNode
}

/**
 * Form client para páginas RSC do admin: dispara toast de sucesso/erro
 * após a Server Action persistir.
 */
export function AdminActionForm({
  action,
  success,
  errorFallback,
  interpretResult = false,
  className,
  children,
}: Props) {
  return (
    <form
      className={className}
      action={async (formData) => {
        if (interpretResult) {
          const result = await action(formData)
          toastFromAction(result as ActionLike, {
            success,
            errorFallback,
          })
          return
        }
        await runPersistAction(() => action(formData), {
          success,
          errorFallback,
        })
      }}
    >
      {children}
    </form>
  )
}
