'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import type { TipoNotificacao } from '@torcida/db'
import { marcarNotificacaoLida } from '@/app/actions/notificacoes'
import { NotificationAvatar } from '@/components/portal/notification-item-visual'
import { markAdminNavbarNotificationRead } from '@/lib/use-admin-navbar-context'

function formatarData(data: Date | string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(data))
}

export function AdminNotificacaoLink({
  id,
  tipo,
  titulo,
  corpo,
  link,
  lida: lidaInicial,
  criadoEm,
}: {
  id: string
  tipo: TipoNotificacao
  titulo: string
  corpo: string | null
  link: string | null
  lida: boolean
  criadoEm: Date | string
}) {
  const [lida, setLida] = useState(lidaInicial)
  const [, startTransition] = useTransition()

  function abrir() {
    if (lida) return
    setLida(true)
    markAdminNavbarNotificationRead(id)
    startTransition(() => {
      void marcarNotificacaoLida(id)
    })
  }

  return (
    <Link
      href={link ?? '/admin'}
      onClick={abrir}
      className={[
        'block rounded-xl border border-[rgb(var(--border))] px-4 py-3 transition-colors',
        lida
          ? 'bg-[rgb(var(--surface))] hover:bg-[rgb(var(--background-subtle))]'
          : 'bg-[rgb(var(--primary)_/_0.06)] hover:bg-[rgb(var(--primary)_/_0.1)]',
      ].join(' ')}
    >
      <span className="flex items-start gap-2.5">
        <NotificationAvatar ator={null} tipo={tipo} size="sm" />
        <span className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[rgb(var(--foreground))]">{titulo}</p>
          {corpo && (
            <p className="mt-1 line-clamp-2 text-xs text-[rgb(var(--foreground-muted))]">
              {corpo}
            </p>
          )}
          <p className="mt-2 text-[10px] text-[rgb(var(--foreground-muted))]">
            {formatarData(criadoEm)}
          </p>
        </span>
      </span>
    </Link>
  )
}
