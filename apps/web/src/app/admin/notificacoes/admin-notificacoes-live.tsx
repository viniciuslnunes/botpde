'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useNotificationStream } from '@/lib/use-notification-stream'
import { refreshAdminNavbarContext } from '@/lib/use-admin-navbar-context'

/**
 * Mantém a central admin alinhada ao ping SSE: a lista é RSC, então um
 * `router.refresh()` relê o banco; o sino/badges vêm do navbar-context.
 */
export function AdminNotificacoesLive() {
  const router = useRouter()
  const onPing = useCallback(() => {
    void refreshAdminNavbarContext(true)
    router.refresh()
  }, [router])

  useNotificationStream(onPing, 'admin')
  return null
}
