'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { NotificationItem } from '@/components/portal/notification-bell'
import { criarVigiaDeNotificacoes } from '@/lib/notification-toast'
import { useNotificationStream } from '@/lib/use-notification-stream'
import { useVisibleInterval } from '@/lib/use-visible-interval'
import { createFetchGeneration } from '@/lib/fetch-generation'

const CACHE_MS = 20_000

interface SuperAdminNavbarContext {
  notifications: NotificationItem[]
  unreadNotifications: number
}

let cached: SuperAdminNavbarContext | null = null
let cachedAt = 0
let inflight: Promise<SuperAdminNavbarContext> | null = null
const fetchGeneration = createFetchGeneration()

const listeners = new Set<(data: SuperAdminNavbarContext) => void>()

const notificarNovas = criarVigiaDeNotificacoes('/super-admin/moderacao')

function emptyContext(): SuperAdminNavbarContext {
  return { notifications: [], unreadNotifications: 0 }
}

function publish(next: SuperAdminNavbarContext, opts?: { touchTtl?: boolean }): void {
  cached = next
  if (opts?.touchTtl !== false) cachedAt = Date.now()
  for (const listener of listeners) listener(next)
}

export function markSuperAdminNavbarNotificationRead(id: string): void {
  const base = cached ?? emptyContext()
  const inList = base.notifications.find((n) => n.id === id)
  if (!inList || inList.lida) return

  publish(
    {
      unreadNotifications: Math.max(0, base.unreadNotifications - 1),
      notifications: base.notifications.map((n) => (n.id === id ? { ...n, lida: true } : n)),
    },
    { touchTtl: false },
  )
}

async function fetchSuperAdminNavbarContext(): Promise<SuperAdminNavbarContext> {
  const res = await fetch('/api/super-admin/navbar-context', { cache: 'no-store' })
  if (!res.ok) return emptyContext()
  const data = (await res.json()) as SuperAdminNavbarContext
  return {
    notifications: data.notifications ?? [],
    unreadNotifications: data.unreadNotifications ?? 0,
  }
}

function loadSuperAdminNavbarContext(force = false): Promise<SuperAdminNavbarContext> {
  const now = Date.now()
  if (!force && cached && now - cachedAt < CACHE_MS) {
    return Promise.resolve(cached)
  }
  if (!force && inflight) return inflight

  const gen = fetchGeneration.next()
  const request = fetchSuperAdminNavbarContext()
    .then((data) => {
      if (!fetchGeneration.isCurrent(gen)) return cached ?? data
      cached = data
      cachedAt = Date.now()
      for (const listener of listeners) listener(data)
      return data
    })
    .finally(() => {
      if (fetchGeneration.isCurrent(gen)) inflight = null
    })

  inflight = request
  return request
}

/**
 * Sino da plataforma: lista SSR + poll 20s + SSE `escopo=plataforma`.
 * Não alimenta a sidebar — filas de Unidades/Moderação já vêm de
 * `contarPendentesSuperAdmin` (contagem de entidade, não de inbox).
 */
export function useSuperAdminNavbarContext(initial: NotificationItem[]): {
  notifications: NotificationItem[]
  unreadNotifications: number
} {
  const router = useRouter()
  const [notifications, setNotifications] = useState(() => cached?.notifications ?? initial)
  const [unreadNotifications, setUnreadNotifications] = useState(
    () => cached?.unreadNotifications ?? initial.filter((n) => !n.lida).length,
  )

  const refresh = useCallback(() => {
    void loadSuperAdminNavbarContext(true).then((data) => {
      const precisaRefresh = notificarNovas(data.notifications, (href) => router.push(href))
      setNotifications(data.notifications)
      setUnreadNotifications(data.unreadNotifications)
      if (precisaRefresh) router.refresh()
    })
  }, [router])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    const onPatch = (data: SuperAdminNavbarContext) => {
      setNotifications(data.notifications)
      setUnreadNotifications(data.unreadNotifications)
    }
    listeners.add(onPatch)
    return () => {
      listeners.delete(onPatch)
    }
  }, [])

  useVisibleInterval(() => refresh(), CACHE_MS)
  useNotificationStream(() => refresh(), 'plataforma')

  return { notifications, unreadNotifications }
}
