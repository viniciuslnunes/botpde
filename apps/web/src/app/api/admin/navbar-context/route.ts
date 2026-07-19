import { NextResponse } from 'next/server'
import { withDbRetry } from '@torcida/db'
import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'
import { getInboxNavbar } from '@/lib/notificacoes'
import { TIPOS_NOTIFICACAO_ADMIN } from '@/lib/notificacoes-comunidade'

/** Espelho admin de `/api/portal/navbar-context`: sino + badges do menu lateral. */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const userId = session.user.id

  const tenant = await getTenantFromHost()
  if (!tenant) {
    return NextResponse.json({ error: 'Tenant não encontrado' }, { status: 404 })
  }

  // Leitura idempotente — resiliente a blips de conexão do proxy Railway.
  const inbox = await withDbRetry(() =>
    getInboxNavbar(tenant.id, userId, TIPOS_NOTIFICACAO_ADMIN, 8, {
      withMenuBadges: true,
    }),
  )

  return NextResponse.json({
    unreadNotifications: inbox.unreadCount,
    menuBadges: inbox.menuBadges,
    notifications: inbox.notifications.map((n) => ({
      ...n,
      criadoEm: n.criadoEm.toISOString(),
    })),
  })
}
