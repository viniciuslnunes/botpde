'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { marcarNotificacoesLidasPorIds } from '@/app/actions/notificacoes'
import { markAdminNavbarNotificationRead, refreshAdminNavbarContext } from '@/lib/use-admin-navbar-context'
import { NOTIFICATION_AUTO_READ_DELAY_MS } from '@/lib/notificacao-auto-read'

/**
 * Componente invisível: marca as notificações não lidas da central admin
 * como lidas após um delay de visualização. `router.refresh()` no final
 * traz `lida: true` fresco via SSR (os `AdminNotificacaoLink` sincronizam
 * o estado visual pela prop `lida`).
 */
export function AdminNotificacoesAutoRead({ ids }: { ids: string[] }) {
  const router = useRouter()

  useEffect(() => {
    if (ids.length === 0) return

    const timer = setTimeout(() => {
      void marcarNotificacoesLidasPorIds(ids).then(() => {
        for (const id of ids) markAdminNavbarNotificationRead(id)
        void refreshAdminNavbarContext(true)
        router.refresh()
      })
    }, NOTIFICATION_AUTO_READ_DELAY_MS)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids])

  return null
}
