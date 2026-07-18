'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from '@torcida/ui'
import { marcarTodasNotificacoesAdminLidas } from '@/app/actions/notificacoes'
import {
  markAdminNavbarNotificationsRead,
  refreshAdminNavbarContext,
} from '@/lib/use-admin-navbar-context'

export function AdminMarcarTodasLidasButton() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function marcarTodas() {
    markAdminNavbarNotificationsRead()
    startTransition(async () => {
      try {
        await marcarTodasNotificacoesAdminLidas()
        void refreshAdminNavbarContext(true)
        router.refresh()
        toast.success('Todas as notificações foram marcadas como lidas.')
      } catch (e) {
        void refreshAdminNavbarContext(true)
        toast.error(e instanceof Error ? e.message : 'Erro ao marcar notificações.')
      }
    })
  }

  return (
    <button
      type="button"
      onClick={marcarTodas}
      disabled={pending}
      className="app-action rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] disabled:opacity-50"
    >
      {pending ? 'Marcando…' : 'Marcar todas como lidas'}
    </button>
  )
}
