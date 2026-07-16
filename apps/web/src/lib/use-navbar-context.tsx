'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { toast } from '@torcida/ui'
import type { NotificationItem } from '@/components/portal/notification-bell'
import { NotificationAvatar } from '@/components/portal/notification-item-visual'
import { useVisibleInterval } from '@/lib/use-visible-interval'

interface NavbarContext {
  unreadMessages: number
  isAdmin: boolean
  notifications: NotificationItem[]
}

const CACHE_MS = 20_000
let cached: NavbarContext | null = null
let cachedAt = 0
let inflight: Promise<NavbarContext> | null = null

/** Ids já vistos — evita toast repetido entre polls (singleton em módulo). */
const seenNotificationIds = new Set<string>()
let hasSeededSeenIds = false

/** Última contagem de não lidas do chat — detecta aumento sem duplicar entre polls. */
let lastUnreadMessages: number | null = null

const MAX_TOASTS_INDIVIDUAIS = 3
const TOAST_DURATION_MS = 6000

function truncar(texto: string, max = 90): string {
  return texto.length > max ? `${texto.slice(0, max - 1)}…` : texto
}

/**
 * Dispara toasts para notificações novas detectadas no polling. O primeiro
 * fetch apenas semeia os ids (sem toast-storm ao abrir a aba).
 */
function notificarNovas(
  notifications: NotificationItem[],
  navegar: (href: string) => void,
): void {
  if (!hasSeededSeenIds) {
    for (const n of notifications) seenNotificationIds.add(n.id)
    hasSeededSeenIds = true
    return
  }

  const novas: NotificationItem[] = []
  for (const n of notifications) {
    if (n.lida || seenNotificationIds.has(n.id)) continue
    seenNotificationIds.add(n.id)
    novas.push(n)
  }

  if (novas.length === 0) return

  if (novas.length > MAX_TOASTS_INDIVIDUAIS) {
    toast.action(
      `+${novas.length} novas notificações`,
      {
        label: 'Ver todas',
        onClick: () => navegar('/portal/comunidade/notificacoes'),
      },
      { duration: TOAST_DURATION_MS },
    )
    return
  }

  for (const n of novas) {
    const destino = n.link ?? '/portal/comunidade/notificacoes'
    toast.custom(
      (id) => (
        <button
          type="button"
          onClick={() => {
            toast.dismiss(id)
            navegar(destino)
          }}
          className="flex w-full items-start gap-2.5 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3 text-left shadow-lg"
        >
          <NotificationAvatar ator={n.ator} tipo={n.tipo} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-[rgb(var(--foreground))]">
              {n.titulo}
            </span>
            {n.corpo && (
              <span className="mt-0.5 block text-xs text-[rgb(var(--foreground-muted))]">
                {truncar(n.corpo)}
              </span>
            )}
          </span>
        </button>
      ),
      { duration: TOAST_DURATION_MS },
    )
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
  const router = useRouter()
  const onMensagensPage = pathname.startsWith('/portal/mensagens')

  const [ctx, setCtx] = useState<NavbarContext>({
    unreadMessages: cached?.unreadMessages ?? 0,
    isAdmin: cached?.isAdmin ?? false,
    notifications: cached?.notifications ?? [],
  })

  const refresh = useCallback(
    (force = false) => {
      void loadNavbarContext(force).then((data) => {
        notificarNovas(data.notifications, (href) => router.push(href))
        notificarMensagemNova(data.unreadMessages, onMensagensPage, (href) => router.push(href))
        setCtx(data)
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

  return { ...ctx, refresh }
}
