'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { Bell } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { TipoNotificacao } from '@torcida/db'
import { marcarNotificacaoLida, marcarNotificacoesLidasPorIds } from '@/app/actions/notificacoes'
import { NotificationAvatar, formatarTituloNotificacao } from '@/components/portal/notification-item-visual'
import { NOTIFICATION_AUTO_READ_DELAY_MS } from '@/lib/notificacao-auto-read'

export interface NotificationItem {
  id: string
  tipo: TipoNotificacao
  titulo: string
  corpo: string | null
  link: string | null
  lida: boolean
  criadoEm: Date | string
  ator: { id: string; nome: string | null; avatarUrl: string | null } | null
}

function formatarData(data: Date | string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(data),
  )
}

function itemsSignatureOf(items: NotificationItem[]): string {
  return items.map((item) => `${item.id}:${item.lida ? 1 : 0}`).join('|')
}

export function NotificationBell({
  initialItems,
  unreadCount: unreadCountProp,
  verTodasHref = '/portal/comunidade/notificacoes',
  verTodasLabel = 'Ver todas as notificações',
  onMarkRead,
}: {
  initialItems: NotificationItem[]
  /** Contagem server-side de não lidas (pode exceder itens carregados no dropdown). */
  unreadCount?: number
  verTodasHref?: string
  verTodasLabel?: string
  /** Patch otimista do badge no contexto da navbar (portal ou admin). */
  onMarkRead?: (id: string) => void
}) {
  const initialSignature = itemsSignatureOf(initialItems)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationItem[]>(initialItems)
  const [itemsSignature, setItemsSignature] = useState(initialSignature)
  const [pending, startTransition] = useTransition()
  const pathname = usePathname()
  const itemsRef = useRef(items)
  itemsRef.current = items

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  // Marca como lidos os itens que já estavam visíveis quando o dropdown
  // abriu, após um delay — dá tempo do usuário perceber o destaque de
  // "não lido" antes dele sumir. Fechar antes do delay cancela.
  useEffect(() => {
    if (!open) return
    const idsNaoLidos = itemsRef.current.filter((item) => !item.lida).map((item) => item.id)
    if (idsNaoLidos.length === 0) return

    const timer = setTimeout(() => {
      setItems((current) =>
        current.map((x) => (idsNaoLidos.includes(x.id) ? { ...x, lida: true } : x)),
      )
      for (const id of idsNaoLidos) onMarkRead?.(id)
      startTransition(() => {
        void marcarNotificacoesLidasPorIds(idsNaoLidos)
      })
    }, NOTIFICATION_AUTO_READ_DELAY_MS)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Alinha lista ao SSR/contexto sem effect (React: ajustar state durante render).
  if (itemsSignature !== initialSignature) {
    setItemsSignature(initialSignature)
    setItems(initialItems)
  }

  const unreadFromItems = useMemo(() => items.filter((item) => !item.lida).length, [items])
  const unreadCount = unreadCountProp ?? unreadFromItems

  function marcarLida(item: NotificationItem) {
    if (item.lida) return
    setItems((current) => current.map((x) => (x.id === item.id ? { ...x, lida: true } : x)))
    onMarkRead?.(item.id)
    startTransition(() => marcarNotificacaoLida(item.id))
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="app-action relative flex h-9 w-9 items-center justify-center rounded-lg border border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
        title="Notificações"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-red-600 px-1 text-[10px] font-bold leading-4 text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <button type="button" onClick={() => setOpen(false)} className="fixed inset-0 z-10 cursor-default" />
          <div className="absolute right-0 z-20 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-2 shadow-lg">
            <div className="border-b border-[rgb(var(--border))] px-2 pb-2">
              <p className="text-sm font-semibold text-[rgb(var(--foreground))]">Notificações</p>
            </div>

            {items.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-[rgb(var(--foreground-muted))]">
                Nenhuma notificação ainda.
              </p>
            ) : (
              <div className="max-h-80 overflow-auto py-1">
                {items.map((item) => (
                  <Link
                    key={item.id}
                    href={item.link ?? '#'}
                    onClick={() => {
                      marcarLida(item)
                      setOpen(false)
                    }}
                    className={[
                      'block rounded-lg px-2 py-2 transition-colors',
                      item.lida
                        ? 'hover:bg-[rgb(var(--background-subtle))]'
                        : 'bg-[rgb(var(--color-primary)_/_0.08)] hover:bg-[rgb(var(--color-primary)_/_0.12)]',
                    ].join(' ')}
                  >
                    <span className="flex items-start gap-2.5">
                      <NotificationAvatar ator={item.ator} tipo={item.tipo} size="sm" />
                      <span className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[rgb(var(--foreground))]">
                          {formatarTituloNotificacao(item)}
                        </p>
                        {item.corpo && (
                          <p className="mt-0.5 line-clamp-2 text-xs text-[rgb(var(--foreground-muted))]">
                            {item.corpo}
                          </p>
                        )}
                        <p className="mt-1 text-[10px] text-[rgb(var(--foreground-muted))]">
                          {formatarData(item.criadoEm)}
                        </p>
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            )}

            <div className="border-t border-[rgb(var(--border))] px-2 py-2">
              <Link
                href={verTodasHref}
                onClick={() => setOpen(false)}
                className="block rounded-lg px-2 py-2 text-center text-xs font-medium text-[rgb(var(--color-primary-fg))] hover:bg-[rgb(var(--background-subtle))]"
              >
                {verTodasLabel}
              </Link>
            </div>

            {pending && (
              <p className="px-2 pb-1 pt-2 text-right text-[10px] text-[rgb(var(--foreground-muted))]">
                Atualizando...
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
