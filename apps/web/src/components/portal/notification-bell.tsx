'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { Bell } from 'lucide-react'
import Link from 'next/link'
import type { TipoNotificacao } from '@torcida/db'
import { marcarNotificacaoLida } from '@/app/actions/notificacoes'
import { NotificationAvatar } from '@/components/portal/notification-item-visual'

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

export function NotificationBell({
  initialItems,
  verTodasHref = '/portal/comunidade/notificacoes',
  verTodasLabel = 'Ver todas as notificações',
}: {
  initialItems: NotificationItem[]
  verTodasHref?: string
  verTodasLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationItem[]>(initialItems)
  const [pending, startTransition] = useTransition()

  const initialSignature = useMemo(
    () => initialItems.map((item) => `${item.id}:${item.lida ? 1 : 0}`).join('|'),
    [initialItems],
  )

  // Layout do admin/portal revalida sem remount — mantém a lista alinhada ao SSR.
  useEffect(() => {
    setItems(initialItems)
  }, [initialSignature, initialItems])

  const unreadCount = useMemo(() => items.filter((item) => !item.lida).length, [items])

  function marcarLida(item: NotificationItem) {
    if (item.lida) return
    setItems((current) => current.map((x) => (x.id === item.id ? { ...x, lida: true } : x)))
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
                        : 'bg-[rgb(var(--primary)_/_0.08)] hover:bg-[rgb(var(--primary)_/_0.12)]',
                    ].join(' ')}
                  >
                    <span className="flex items-start gap-2.5">
                      <NotificationAvatar ator={item.ator} tipo={item.tipo} size="sm" />
                      <span className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[rgb(var(--foreground))]">{item.titulo}</p>
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
                className="block rounded-lg px-2 py-2 text-center text-xs font-medium text-[rgb(var(--primary))] hover:bg-[rgb(var(--background-subtle))]"
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
