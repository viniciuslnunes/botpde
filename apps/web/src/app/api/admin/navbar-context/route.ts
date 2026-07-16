import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'
import { getInboxNavbar } from '@/lib/notificacoes'
import { TIPOS_NOTIFICACAO_ADMIN } from '@/lib/notificacoes-comunidade'

/** Espelho admin de `/api/portal/navbar-context`: só as notificações do sino. */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const tenant = await getTenantFromHost()
  if (!tenant) {
    return NextResponse.json({ error: 'Tenant não encontrado' }, { status: 404 })
  }

  const inbox = await getInboxNavbar(
    tenant.id,
    session.user.id,
    TIPOS_NOTIFICACAO_ADMIN,
    8,
  )

  return NextResponse.json({
    unreadNotifications: inbox.unreadCount,
    notifications: inbox.notifications.map((n) => ({
      ...n,
      criadoEm: n.criadoEm.toISOString(),
    })),
  })
}
