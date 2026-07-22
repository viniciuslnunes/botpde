'use client'

import { useEffect } from 'react'
import { Loader2, Shield } from 'lucide-react'

type Props = {
  redirectTo?: string
  message?: string
  description?: string
}

/** Navega após Server Action gravar cookie de sessão (redirect() do servidor descarta). */
export function AuthRedirectEffect({
  redirectTo,
  message = 'Entrando...',
  description,
}: Props) {
  useEffect(() => {
    if (redirectTo) {
      window.location.assign(redirectTo)
    }
  }, [redirectTo])

  if (!redirectTo) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-[rgb(var(--background))] p-6 text-center"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex flex-col items-center gap-3">
        <Shield className="h-10 w-10 text-[rgb(var(--color-primary-fg))]" aria-hidden />
        <Loader2 className="h-8 w-8 animate-spin text-[rgb(var(--color-primary-fg))]" aria-hidden />
      </div>
      <div className="space-y-1">
        <p className="text-base font-semibold text-[rgb(var(--foreground))]">{message}</p>
        {description ? (
          <p className="max-w-xs text-sm text-[rgb(var(--foreground-muted))]">{description}</p>
        ) : null}
      </div>
    </div>
  )
}
