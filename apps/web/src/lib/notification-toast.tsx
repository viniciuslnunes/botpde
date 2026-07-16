'use client'

import { toast } from '@torcida/ui'
import type { NotificationItem } from '@/components/portal/notification-bell'
import { NotificationAvatar } from '@/components/portal/notification-item-visual'

/** Tipos cujo efeito muda dados renderizados por Server Components (ex.: painel
 * lateral da comunidade) — exigem `router.refresh()` além do toast. */
export const TIPOS_QUE_EXIGEM_REFRESH: ReadonlySet<string> = new Set(['MEMBRO_APROVADO'])

const MAX_TOASTS_INDIVIDUAIS = 3
const TOAST_DURATION_MS = 6000

function truncar(texto: string, max = 90): string {
  return texto.length > max ? `${texto.slice(0, max - 1)}…` : texto
}

/**
 * Cria um "vigia" de notificações novas com seu próprio estado isolado (ids já
 * vistos). Cada consumidor (portal, admin) instancia o seu — evita que o seed
 * de um contaminasse o outro. O primeiro fetch apenas semeia os ids (sem
 * toast-storm ao abrir a aba). O retorno indica quando alguma notificação nova
 * exige revalidar a árvore de Server Components.
 */
export function criarVigiaDeNotificacoes(verTodasHref: string) {
  const seenNotificationIds = new Set<string>()
  let hasSeededSeenIds = false

  return function notificarNovas(
    notifications: NotificationItem[],
    navegar: (href: string) => void,
  ): boolean {
    if (!hasSeededSeenIds) {
      for (const n of notifications) seenNotificationIds.add(n.id)
      hasSeededSeenIds = true
      return false
    }

    const novas: NotificationItem[] = []
    for (const n of notifications) {
      if (n.lida || seenNotificationIds.has(n.id)) continue
      seenNotificationIds.add(n.id)
      novas.push(n)
    }

    if (novas.length === 0) return false

    const precisaRefresh = novas.some((n) => TIPOS_QUE_EXIGEM_REFRESH.has(n.tipo))

    if (novas.length > MAX_TOASTS_INDIVIDUAIS) {
      toast.action(
        `+${novas.length} novas notificações`,
        {
          label: 'Ver todas',
          onClick: () => navegar(verTodasHref),
        },
        { duration: TOAST_DURATION_MS },
      )
      return precisaRefresh
    }

    for (const n of novas) {
      const destino = n.link ?? verTodasHref
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

    return precisaRefresh
  }
}
