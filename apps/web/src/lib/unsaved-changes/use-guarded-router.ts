'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useMemo } from 'react'
import { useUnsavedChangesContext } from './context'

type GuardedRouter = {
  push: (href: string) => Promise<boolean>
  replace: (href: string) => Promise<boolean>
  prefetch: (href: string) => void
  back: () => Promise<boolean>
  refresh: () => void
  /** Router Next original (sem guard). */
  unsafe: ReturnType<typeof useRouter>
}

/**
 * Router que confirma descarte antes de navegar quando há alterações não salvas.
 * Retorna `true` se a navegação ocorreu.
 */
export function useGuardedRouter(): GuardedRouter {
  const router = useRouter()
  const { confirmDiscard } = useUnsavedChangesContext()

  const push = useCallback(
    async (href: string) => {
      const ok = await confirmDiscard()
      if (!ok) return false
      router.push(href)
      return true
    },
    [confirmDiscard, router],
  )

  const replace = useCallback(
    async (href: string) => {
      const ok = await confirmDiscard()
      if (!ok) return false
      router.replace(href)
      return true
    },
    [confirmDiscard, router],
  )

  const back = useCallback(async () => {
    const ok = await confirmDiscard()
    if (!ok) return false
    router.back()
    return true
  }, [confirmDiscard, router])

  return useMemo(
    () => ({
      push,
      replace,
      back,
      prefetch: (href: string) => router.prefetch(href),
      refresh: () => router.refresh(),
      unsafe: router,
    }),
    [push, replace, back, router],
  )
}
