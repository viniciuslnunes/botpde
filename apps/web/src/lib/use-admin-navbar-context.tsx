'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { NotificationItem } from '@/components/portal/notification-bell'
import { criarVigiaDeNotificacoes } from '@/lib/notification-toast'
import { useNotificationStream } from '@/lib/use-notification-stream'
import { useVisibleInterval } from '@/lib/use-visible-interval'

const CACHE_MS = 20_000

interface AdminNavbarContext {
  notifications: NotificationItem[]
  unreadNotifications: number
  menuBadges: Record<string, number>
}

let cached: AdminNavbarContext | null = null
let cachedAt = 0
let inflight: Promise<AdminNavbarContext> | null = null

const listeners = new Set<(data: AdminNavbarContext) => void>()

/** Vigia singleton do admin — só há um topbar admin montado por vez. */
const notificarNovas = criarVigiaDeNotificacoes('/admin/notificacoes')

function emptyContext(): AdminNavbarContext {
  return { notifications: [], unreadNotifications: 0, menuBadges: {} }
}

function publish(next: AdminNavbarContext): void {
  cached = next
  cachedAt = Date.now()
  for (const listener of listeners) listener(next)
}

/** Zera o badge do sino admin imediatamente. */
export function markAdminNavbarNotificationsRead(): void {
  const base = cached ?? emptyContext()
  publish({
    ...base,
    unreadNotifications: 0,
    notifications: base.notifications.map((n) => ({ ...n, lida: true })),
  })
}

/** Marca uma notificação admin como lida no cache e decrementa o badge. */
export function markAdminNavbarNotificationRead(id: string): void {
  const base = cached ?? emptyContext()
  const inList = base.notifications.find((n) => n.id === id)
  if (inList?.lida) return

  publish({
    ...base,
    unreadNotifications: Math.max(0, base.unreadNotifications - 1),
    notifications: base.notifications.map((n) => (n.id === id ? { ...n, lida: true } : n)),
  })
}

export function refreshAdminNavbarContext(force = true): Promise<AdminNavbarContext> {
  return loadAdminNavbarContext(force)
}

async function fetchAdminNavbarContext(): Promise<AdminNavbarContext> {
  const res = await fetch('/api/admin/navbar-context', { cache: 'no-store' })
  if (!res.ok) return emptyContext()
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

function loadAdminNavbarContext(force = false): Promise<AdminNavbarContext> {
  const now = Date.now()
  if (!force && cached && now - cachedAt < CACHE_MS) {
    return Promise.resolve(cached)
  }
  if (!force && inflight) return inflight

  inflight = fetchAdminNavbarContext()
    .then((data) => {
      cached = data
      cachedAt = Date.now()
      for (const listener of listeners) listener(data)
      return data
    })
    .finally(() => {
      inflight = null
    })

  return inflight
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
  const [notifications, setNotifications] = useState(() => cached?.notifications ?? initial)
  const [unreadNotifications, setUnreadNotifications] = useState(
    () => cached?.unreadNotifications ?? 0,
  )
  const [menuBadges, setMenuBadges] = useState(() => cached?.menuBadges ?? {})

  const refresh = useCallback(() => {
    void loadAdminNavbarContext(true).then((data) => {
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

  useEffect(() => {
    const onPatch = (data: AdminNavbarContext) => {
      setNotifications(data.notifications)
      setUnreadNotifications(data.unreadNotifications)
      setMenuBadges(data.menuBadges)
    }
    listeners.add(onPatch)
    return () => {
      listeners.delete(onPatch)
    }
  }, [])

  useVisibleInterval(() => refresh(), CACHE_MS)
  useNotificationStream(() => refresh(), 'admin')

  return { notifications, unreadNotifications, menuBadges }
}
