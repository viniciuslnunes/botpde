'use client'

import { useEffect } from 'react'

/** Navega após Server Action gravar cookie de sessão (redirect() do servidor descarta). */
export function AuthRedirectEffect({ redirectTo }: { redirectTo?: string }) {
  useEffect(() => {
    if (redirectTo) {
      window.location.assign(redirectTo)
    }
  }, [redirectTo])

  return null
}
