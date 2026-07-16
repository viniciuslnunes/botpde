'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { toast } from '@torcida/ui'
import type { NotificationItem } from '@/components/portal/notification-bell'
import { criarVigiaDeNotificacoes } from '@/lib/notification-toast'
import { useNotificationStream } from '@/lib/use-notification-stream'
import { useInboxStream } from '@/lib/use-mensagem-stream'
import { useVisibleInterval } from '@/lib/use-visible-interval'

interface NavbarContext {
  unreadMessages: number
  unreadNotifications: number
  hasAdminAreaAccess: boolean
  /** @deprecated Use hasAdminAreaAccess */
  isAdmin: boolean
  notifications: NotificationItem[]
}

const CACHE_MS = 20_000
let cached: NavbarContext | null = null
let cachedAt = 0
let inflight: Promise<NavbarContext> | null = null

/** Última contagem de não lidas do chat — detecta aumento sem duplicar entre polls. */
let lastUnreadMessages: number | null = null

const TOAST_DURATION_MS = 6000

/** Vigia singleton do portal — só há um navbar de portal montado por vez. */
const notificarNovas = criarVigiaDeNotificacoes('/portal/comunidade/notificacoes')

/**
 * Alerta genérico de mensagem nova a partir do contador do chat — não usa a
 * tabela `Notificacao` (mensagens ficam só no ícone/inbox de chat). Silencia
 * quando o usuário já está em `/portal/mensagens`.
 */
function notificarMensagemNova(
  unreadMessages: number,
  naTelaDeMensagens: boolean,
  navegar: (href: string) => void,
): void {
  if (lastUnreadMessages === null) {
    lastUnreadMessages = unreadMessages
    return
  }

  if (unreadMessages > lastUnreadMessages && !naTelaDeMensagens) {
    toast.action(
      'Nova mensagem',
      { label: 'Ver', onClick: () => navegar('/portal/mensagens') },
      { duration: TOAST_DURATION_MS },
    )
  }

  lastUnreadMessages = unreadMessages
}

async function fetchNavbarContext(): Promise<NavbarContext> {
  const res = await fetch('/api/portal/navbar-context', { cache: 'no-store' })
  if (!res.ok) {
    return {
      unreadMessages: 0,
      unreadNotifications: 0,
      hasAdminAreaAccess: false,
      isAdmin: false,
      notifications: [],
    }
  }
  const data = (await res.json()) as NavbarContext & { isAdmin?: boolean }
  return {
    unreadMessages: data.unreadMessages ?? 0,
    unreadNotifications: data.unreadNotifications ?? 0,
    hasAdminAreaAccess: data.hasAdminAreaAccess ?? data.isAdmin ?? false,
    isAdmin: data.hasAdminAreaAccess ?? data.isAdmin ?? false,
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
  const router = useRouter()
  const onMensagensPage = pathname.startsWith('/portal/mensagens')

  const [ctx, setCtx] = useState<NavbarContext>({
    unreadMessages: cached?.unreadMessages ?? 0,
    unreadNotifications: cached?.unreadNotifications ?? 0,
    hasAdminAreaAccess: cached?.hasAdminAreaAccess ?? false,
    isAdmin: cached?.isAdmin ?? false,
    notifications: cached?.notifications ?? [],
  })

  const refresh = useCallback(
    (force = false) => {
      void loadNavbarContext(force).then((data) => {
        const precisaRefresh = notificarNovas(data.notifications, (href) => router.push(href))
        notificarMensagemNova(data.unreadMessages, onMensagensPage, (href) => router.push(href))
        setCtx(data)
        if (precisaRefresh) router.refresh()
      })
    },
    [router, onMensagensPage],
  )

  useEffect(() => {
    refresh()
  }, [refresh])

  useVisibleInterval(() => {
    if (onMensagensPage) return
    refresh()
  }, CACHE_MS)

  useNotificationStream(() => refresh(true))
  useInboxStream(() => refresh(true))

  return { ...ctx, refresh }
}
