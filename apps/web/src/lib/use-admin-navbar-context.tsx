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

async function fetchAdminNavbarContext(): Promise<{
  notifications: NotificationItem[]
  unreadNotifications: number
  menuBadges: Record<string, number>
}> {
  const res = await fetch('/api/admin/navbar-context', { cache: 'no-store' })
  if (!res.ok) return { notifications: [], unreadNotifications: 0, menuBadges: {} }
  const data = (await res.json()) as {
    notifications?: NotificationItem[]
    unreadNotifications?: number
    menuBadges?: Record<string, number>
  }
  return {
    notifications: data.notifications ?? [],
    unreadNotifications: data.unreadNotifications ?? 0,
    menuBadges: data.menuBadges ?? {},
  }
}

/**
 * Mantém o sino e os badges do menu admin vivos: parte da lista SSR (`initial`),
 * refaz o fetch por polling (fallback) e por push SSE.
 */
export function useAdminNavbarContext(initial: NotificationItem[]): {
  notifications: NotificationItem[]
  unreadNotifications: number
  menuBadges: Record<string, number>
} {
  const router = useRouter()
  const [notifications, setNotifications] = useState<NotificationItem[]>(initial)
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const [menuBadges, setMenuBadges] = useState<Record<string, number>>({})

  const refresh = useCallback(() => {
    void fetchAdminNavbarContext().then((data) => {
      const precisaRefresh = notificarNovas(data.notifications, (href) => router.push(href))
      setNotifications(data.notifications)
      setUnreadNotifications(data.unreadNotifications)
      setMenuBadges(data.menuBadges)
      if (precisaRefresh) router.refresh()
    })
  }, [router])

  useEffect(() => {
    refresh()
  }, [refresh])

  useVisibleInterval(() => refresh(), CACHE_MS)
  useNotificationStream(() => refresh())

  return { notifications, unreadNotifications, menuBadges }
}
