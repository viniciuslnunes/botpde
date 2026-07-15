'use client'

import { useEffect, useRef } from 'react'
import { toast, type ToastActionConfig } from '@torcida/ui/services/toast'

/** Formas de retorno usadas pelas Server Actions do app. */
export type ActionLike = {
  success?: boolean
  ok?: boolean
  error?: string
  message?: string
  errors?: Record<string, string[]>
}

export type PersistToastLabels = {
  success: string
  /** Texto secundário no toast de sucesso */
  successDescription?: string
  errorFallback?: string
  /** CTA no toast de sucesso (ex.: Ver sacola, Ver pedido) */
  action?: ToastActionConfig
  /** ID estável — evita spam do mesmo feedback em sequência */
  id?: string | number
}

function firstFieldError(errors?: Record<string, string[]>): string | undefined {
  if (!errors) return undefined
  for (const messages of Object.values(errors)) {
    if (messages?.[0]) return messages[0]
  }
  return undefined
}

export function isRedirectError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const digest = (error as { digest?: string }).digest
  return typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')
}

function isFailure(result: ActionLike): boolean {
  if (firstFieldError(result.errors)) return true
  if (result.success === false || result.ok === false) return true
  if (result.error) return true
  if (result.message && result.success !== true && result.ok !== true) return true
  return false
}

function successOpts(labels: PersistToastLabels) {
  return {
    id: labels.id,
    description: labels.successDescription,
    action: labels.action
      ? { label: labels.action.label, onClick: labels.action.onClick }
      : undefined,
  }
}

/**
 * Interpreta o retorno fragmentado das Server Actions e dispara toast.
 * Retorna `true` quando a persistência foi bem-sucedida.
 */
export function toastFromAction(
  result: ActionLike | void | null,
  labels: PersistToastLabels,
  options?: { emptyAsSuccess?: boolean },
): boolean {
  const emptyAsSuccess = options?.emptyAsSuccess !== false
  const fallback = labels.errorFallback ?? 'Não foi possível concluir.'

  if (result == null) {
    toast.success(labels.success, successOpts(labels))
    return true
  }

  if (isFailure(result)) {
    toast.error(
      result.error ??
        result.message ??
        firstFieldError(result.errors) ??
        fallback,
      { id: labels.id },
    )
    return false
  }

  if (result.success === true || result.ok === true) {
    toast.success(labels.success, successOpts(labels))
    return true
  }

  if (emptyAsSuccess) {
    toast.success(labels.success, successOpts(labels))
    return true
  }

  return true
}

/**
 * Executa mutação (throw ou ActionLike) e notifica via toast.
 * Repropaga `NEXT_REDIRECT` após toast de sucesso para o App Router seguir.
 */
export async function runPersistAction(
  action: () => Promise<unknown>,
  labels: PersistToastLabels,
): Promise<boolean> {
  try {
    const result = await action()
    return toastFromAction(result as ActionLike | void, labels)
  } catch (error) {
    if (isRedirectError(error)) {
      toast.success(labels.success, successOpts(labels))
      throw error
    }
    toast.error(
      error instanceof Error
        ? error.message
        : (labels.errorFallback ?? 'Não foi possível concluir.'),
      { id: labels.id },
    )
    return false
  }
}

/**
 * Forms que validam no servidor e `redirect()` no sucesso.
 * Atualiza o state local só em falha; toast de sucesso no redirect.
 */
export async function submitRedirectAction<T extends ActionLike>(
  action: () => Promise<T>,
  setState: (state: T) => void,
  labels: PersistToastLabels,
): Promise<void> {
  try {
    const result = await action()
    setState(result)
    if (isFailure(result)) {
      toastFromAction(result, labels, { emptyAsSuccess: false })
    }
  } catch (error) {
    if (isRedirectError(error)) {
      toast.success(labels.success, successOpts(labels))
      throw error
    }
    toast.error(
      error instanceof Error
        ? error.message
        : (labels.errorFallback ?? 'Não foi possível concluir.'),
      { id: labels.id },
    )
  }
}

/**
 * Observa `useActionState` e dispara toast ao concluir o ciclo pending → idle.
 * Por padrão, erros de campo ficam só no form (`FieldError`); toast cobre
 * success / message / `{}` pós-mutação.
 */
export function useActionStateToast(
  state: ActionLike,
  pending: boolean,
  successMessage: string,
  options?: {
    errorFallback?: string
    toastFieldErrors?: boolean
    successDescription?: string
    action?: ToastActionConfig
    id?: string | number
    /** Chamado quando a action concluiu com sucesso (útil para limpar dirty). */
    onSuccess?: () => void
  },
): void {
  const wasPending = useRef(false)
  const onSuccessRef = useRef(options?.onSuccess)

  useEffect(() => {
    onSuccessRef.current = options?.onSuccess
  }, [options?.onSuccess])

  useEffect(() => {
    if (wasPending.current && !pending) {
      const fieldError = firstFieldError(state.errors)
      if (fieldError && !options?.toastFieldErrors) {
        if (state.message) toast.error(state.message)
      } else {
        const ok = toastFromAction(
          state,
          {
            success: successMessage,
            errorFallback: options?.errorFallback,
            successDescription: options?.successDescription,
            action: options?.action,
            id: options?.id,
          },
          { emptyAsSuccess: true },
        )
        if (ok) onSuccessRef.current?.()
      }
    }
    wasPending.current = pending
  }, [
    pending,
    state,
    successMessage,
    options?.errorFallback,
    options?.toastFieldErrors,
    options?.successDescription,
    options?.action,
    options?.id,
  ])
}

/**
 * Executa Promise com toast.promise (loading → success/error).
 * Ideal para uploads e imports.
 */
export async function runPromiseAction<T>(
  promise: Promise<T>,
  messages: {
    loading: string
    success: string | ((data: T) => string)
    error?: string | ((error: unknown) => string)
    description?: string | ((data: T) => string)
  },
): Promise<T> {
  return toast.promise(promise, {
    loading: messages.loading,
    success: messages.success,
    error:
      messages.error ??
      ((error: unknown) =>
        error instanceof Error ? error.message : 'Não foi possível concluir.'),
    description: messages.description,
  }).unwrap()
}
