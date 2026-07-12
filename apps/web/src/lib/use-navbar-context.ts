'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import type { NotificationItem } from '@/components/portal/notification-bell'
import { useVisibleInterval } from '@/lib/use-visible-interval'

interface NavbarContext {
  unreadMessages: number
  isAdmin: boolean
  notifications: NotificationItem[]
}

const CACHE_MS = 60_000
let cached: NavbarContext | null = null
let cachedAt = 0
let inflight: Promise<NavbarContext> | null = null

async function fetchNavbarContext(): Promise<NavbarContext> {
  const res = await fetch('/api/portal/navbar-context', { cache: 'no-store' })
  if (!res.ok) {
    return { unreadMessages: 0, isAdmin: false, notifications: [] }
  }
  const data = (await res.json()) as NavbarContext
  return {
    unreadMessages: data.unreadMessages ?? 0,
    isAdmin: data.isAdmin ?? false,
    notifications: data.notifications ?? [],
  }
}

function loadNavbarContext(force = false): Promise<NavbarContext> {
  const now = Date.now()
  if (!force && cached && now - cachedAt < CACHE_MS) {
    return Promise.resolve(cached)
  }
  if (!force && inflight) return inflight

  inflight = fetchNavbarContext()
    .then((data) => {
      cached = data
      cachedAt = Date.now()
      return data
    })
    .finally(() => {
      inflight = null
    })

  return inflight
}

export function useNavbarContext() {
  const pathname = usePathname()
  const onMensagensPage = pathname.startsWith('/portal/mensagens')

  const [ctx, setCtx] = useState<NavbarContext>({
    unreadMessages: cached?.unreadMessages ?? 0,
    isAdmin: cached?.isAdmin ?? false,
    notifications: cached?.notifications ?? [],
  })

  const refresh = useCallback((force = false) => {
    void loadNavbarContext(force).then(setCtx)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  useVisibleInterval(() => {
    if (onMensagensPage) return
    refresh()
  }, CACHE_MS)

  return { ...ctx, refresh }
}
