'use client'

import { Toaster, toast as sonnerToast } from 'sonner'

export function ToastProvider() {
  return (
    <Toaster
      position="top-right"
      richColors
      closeButton
      duration={4000}
      toastOptions={{
        classNames: {
          toast: 'font-sans',
        },
      }}
    />
  )
}

export const toast = {
  success: (message: string, description?: string) =>
    sonnerToast.success(message, { description }),

  error: (message: string, description?: string) =>
    sonnerToast.error(message, { description }),

  warning: (message: string, description?: string) =>
    sonnerToast.warning(message, { description }),

  info: (message: string, description?: string) =>
    sonnerToast.info(message, { description }),

  loading: (message: string) => sonnerToast.loading(message),

  promise: <T,>(
    promise: Promise<T>,
    messages: { loading: string; success: string; error: string },
  ) => sonnerToast.promise(promise, messages),

  dismiss: (id?: string | number) => sonnerToast.dismiss(id),
}
