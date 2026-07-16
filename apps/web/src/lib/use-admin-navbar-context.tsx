'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { NotificationItem } from '@/components/portal/notification-bell'
import { criarVigiaDeNotificacoes } from '@/lib/notification-toast'
import { useNotificationStream } from '@/lib/use-notification-stream'
import { useVisibleInterval } from '@/lib/use-visible-interval'

const CACHE_MS = 20_000

/** Vigia singleton do admin — só há um topbar admin montado por vez. */
const notificarNovas = criarVigiaDeNotificacoes('/admin/notificacoes')

async function fetchAdminNotifications(): Promise<NotificationItem[]> {
  const res = await fetch('/api/admin/navbar-context', { cache: 'no-store' })
  if (!res.ok) return []
  const data = (await res.json()) as { notifications?: NotificationItem[] }
  return data.notifications ?? []
}

/**
 * Mantém o sino do admin vivo: parte da lista SSR (`initial`, só no primeiro
 * render — o polling/SSE mantém os dados mais frescos que a prop em navegações
 * seguintes), refaz o fetch por polling (fallback) e por push SSE.
 */
export function useAdminNavbarContext(initial: NotificationItem[]): NotificationItem[] {
  const router = useRouter()
  const [items, setItems] = useState<NotificationItem[]>(initial)

  const refresh = useCallback(() => {
    void fetchAdminNotifications().then((notifications) => {
      const precisaRefresh = notificarNovas(notifications, (href) => router.push(href))
      setItems(notifications)
      if (precisaRefresh) router.refresh()
    })
  }, [router])

  useEffect(() => {
    refresh()
  }, [refresh])

  useVisibleInterval(() => refresh(), CACHE_MS)
  useNotificationStream(() => refresh())

  return items
}
