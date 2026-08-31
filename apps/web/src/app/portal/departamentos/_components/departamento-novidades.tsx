'use client'

import Link from 'next/link'
import { Bell } from 'lucide-react'
import {
  NotificationAvatar,
  formatarTituloNotificacao,
  formatarQuandoNotificacao,
} from '@/components/portal/notification-item-visual'
import { markNavbarNotificationRead, useNavbarSnapshot } from '@/lib/use-navbar-context'
import { marcarNotificacaoLida } from '@/app/actions/notificacoes'

/** Faixa das ações de departamento ainda não lidas, da mais recente à mais antiga. */
export function DepartamentoNovidades() {
  const { departamentoNotificacoes } = useNavbarSnapshot()
  const itens = departamentoNotificacoes.filter((n) => !n.lida)
  if (itens.length === 0) return null

  return (
    <section
      aria-label="Novidades nos departamentos"
      className="rounded-2xl border border-[rgb(var(--color-primary)_/_0.25)] bg-[rgb(var(--color-primary)_/_0.06)] p-4"
    >
      <h2 className="flex items-center gap-2 text-sm font-semibold text-[rgb(var(--foreground))]">
        <Bell className="h-4 w-4 text-[rgb(var(--color-primary-fg))]" aria-hidden />
        Novidades
      </h2>
      <ul className="mt-3 space-y-1.5">
        {itens.map((item) => (
          <li key={item.id}>
            <Link
              href={item.link ?? '/portal/departamentos'}
              onClick={() => {
                markNavbarNotificationRead(item.id)
                void marcarNotificacaoLida(item.id)
              }}
              className="flex items-start gap-2.5 rounded-xl px-2 py-2 transition-colors hover:bg-[rgb(var(--surface))]"
            >
              <NotificationAvatar ator={item.ator} tipo={item.tipo} size="sm" />
              <span className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[rgb(var(--foreground))]">
                  {formatarTituloNotificacao(item)}
                </p>
                <p className="mt-0.5 line-clamp-2 text-xs text-[rgb(var(--foreground-muted))]">
                  {item.corpo?.trim() || item.titulo}
                </p>
                <p className="mt-1 text-[10px] text-[rgb(var(--foreground-muted))]">
                  {formatarQuandoNotificacao(item.criadoEm)}
                </p>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
