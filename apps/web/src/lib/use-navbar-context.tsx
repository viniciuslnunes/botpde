'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { toast } from '@torcida/ui'
import type { NotificationItem } from '@/components/portal/notification-bell'
import { criarVigiaDeNotificacoes } from '@/lib/notification-toast'
import { useNotificationStream } from '@/lib/use-notification-stream'
import { useInboxStream } from '@/lib/use-mensagem-stream'
import { useVisibleInterval } from '@/lib/use-visible-interval'
import { createFetchGeneration } from '@/lib/fetch-generation'
import {
  agregarBadgesDeInbox,
  emptyPortalNavBadges,
  subtrairPortalNavBadges,
  type PortalNavBadges,
} from '@/lib/notificacoes-menu-badges'

interface NavbarContext {
  unreadMessages: number
  unreadNotifications: number
  hasAdminAreaAccess: boolean
  /** @deprecated Use hasAdminAreaAccess */
  isAdmin: boolean
  notifications: NotificationItem[]
  navBadges: PortalNavBadges
  departamentoNotificacoes: NotificationItem[]
}

const CACHE_MS = 20_000
let cached: NavbarContext | null = null
let cachedAt = 0
let inflight: Promise<NavbarContext> | null = null
const fetchGeneration = createFetchGeneration()

/** Assinantes do patch otimista (sino, nav lateral, rollback). */
const listeners = new Set<(data: NavbarContext) => void>()

/** Última contagem de não lidas do chat — detecta aumento sem duplicar entre polls. */
let lastUnreadMessages: number | null = null

const TOAST_DURATION_MS = 6000

/** Vigia singleton do portal — só há um navbar de portal montado por vez. */
const notificarNovas = criarVigiaDeNotificacoes('/portal/comunidade/notificacoes')

function emptyContext(): NavbarContext {
  return {
    unreadMessages: 0,
    unreadNotifications: 0,
    hasAdminAreaAccess: false,
    isAdmin: false,
    notifications: [],
    navBadges: emptyPortalNavBadges(),
    departamentoNotificacoes: [],
  }
}

function publish(next: NavbarContext, opts?: { touchTtl?: boolean }): void {
  cached = next
  if (opts?.touchTtl !== false) cachedAt = Date.now()
  for (const listener of listeners) listener(next)
}

/**
 * Zera o badge do sino imediatamente e marca os itens em cache como lidos.
 * Usado por "marcar todas como lidas" antes do round-trip da Server Action.
 */
export function markNavbarNotificationsRead(): void {
  const base = cached ?? emptyContext()
  publish(
    {
      ...base,
      unreadNotifications: 0,
      notifications: base.notifications.map((n) => ({ ...n, lida: true })),
      navBadges: emptyPortalNavBadges(),
      departamentoNotificacoes: base.departamentoNotificacoes.map((n) => ({ ...n, lida: true })),
    },
    { touchTtl: false },
  )
}

/**
 * Marca uma notificação como lida no cache e decrementa o badge (mín. 0).
 * Se o item não está no dropdown, ainda assim decrementa — o clique veio de item não lido.
 */
export function markNavbarNotificationRead(id: string): void {
  const base = cached ?? emptyContext()
  const inList =
    base.notifications.find((n) => n.id === id) ??
    base.departamentoNotificacoes.find((n) => n.id === id)
  if (!inList || inList.lida) return

  const delta = agregarBadgesDeInbox([{ tipo: inList.tipo, link: inList.link }])
  publish(
    {
      ...base,
      unreadNotifications: Math.max(0, base.unreadNotifications - 1),
      notifications: base.notifications.map((n) =>
        n.id === id ? { ...n, lida: true } : n,
      ),
      departamentoNotificacoes: base.departamentoNotificacoes.map((n) =>
        n.id === id ? { ...n, lida: true } : n,
      ),
      navBadges: subtrairPortalNavBadges(base.navBadges, delta.portalNavBadges),
    },
    { touchTtl: false },
  )
}

/** Decrementa o badge sem id (ex.: aprovar/rejeitar seguimento que limpa notif no servidor). */
export function decrementNavbarUnread(by = 1): void {
  if (by <= 0) return
  const base = cached ?? emptyContext()
  publish(
    {
      ...base,
      unreadNotifications: Math.max(0, base.unreadNotifications - by),
    },
    { touchTtl: false },
  )
}

/** Assina mudanças do contador de não lidas (nav lateral da Comunidade). */
export function subscribeNavbarUnread(listener: (unread: number) => void): () => void {
  const wrapped = (data: NavbarContext) => listener(data.unreadNotifications)
  listeners.add(wrapped)
  return () => {
    listeners.delete(wrapped)
  }
}

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
    return emptyContext()
  }
  const data = (await res.json()) as NavbarContext & { isAdmin?: boolean }
  return {
    unreadMessages: data.unreadMessages ?? 0,
    unreadNotifications: data.unreadNotifications ?? 0,
    hasAdminAreaAccess: data.hasAdminAreaAccess ?? data.isAdmin ?? false,
    isAdmin: data.hasAdminAreaAccess ?? data.isAdmin ?? false,
    notifications: data.notifications ?? [],
    navBadges: data.navBadges ?? emptyPortalNavBadges(),
    departamentoNotificacoes: data.departamentoNotificacoes ?? [],
  }
}

function loadNavbarContext(force = false): Promise<NavbarContext> {
  const now = Date.now()
  if (!force && cached && now - cachedAt < CACHE_MS) {
    return Promise.resolve(cached)
  }
  if (!force && inflight) return inflight

  const gen = fetchGeneration.next()
  const request = fetchNavbarContext()
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

/** Recarrega o contexto da navbar (rollback após falha otimista). */
export function refreshNavbarContext(force = true): Promise<NavbarContext> {
  return loadNavbarContext(force)
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
    navBadges: cached?.navBadges ?? emptyPortalNavBadges(),
    departamentoNotificacoes: cached?.departamentoNotificacoes ?? [],
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

  useEffect(() => {
    const onPatch = (data: NavbarContext) => setCtx(data)
    listeners.add(onPatch)
    return () => {
      listeners.delete(onPatch)
    }
  }, [])

  useVisibleInterval(() => {
    if (onMensagensPage) return
    refresh()
  }, CACHE_MS)

  useNotificationStream(() => refresh(true))
  useInboxStream(() => refresh(true))

  return { ...ctx, refresh }
}

/**
 * Snapshot só de leitura — hub/seções de departamento escutam o mesmo cache
 * da navbar, sem um segundo SSE/poll.
 */
export function useNavbarSnapshot(): NavbarContext {
  const [ctx, setCtx] = useState<NavbarContext>(() => cached ?? emptyContext())
  useEffect(() => {
    const onPatch = (data: NavbarContext) => setCtx(data)
    listeners.add(onPatch)
    return () => {
      listeners.delete(onPatch)
    }
  }, [])
  return ctx
}
