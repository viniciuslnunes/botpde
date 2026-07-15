'use client'

/** Import direto do módulo — evita fragmentar toast/Toaster via barrel + optimizePackageImports. */
import { ToastProvider } from '@torcida/ui/services/toast'

/** Toast no root layout — sem dynamic, para o Toaster existir antes das actions. */
export function ClientToastProvider() {
  return <ToastProvider />
}
