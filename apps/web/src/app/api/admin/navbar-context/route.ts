import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'
import { contarNotificacoesNaoLidas, listarNotificacoesRecentes } from '@/lib/notificacoes'
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

  const userId = session.user.id

  const [notifications, unreadNotifications] = await Promise.all([
    listarNotificacoesRecentes(tenant.id, userId, 8, TIPOS_NOTIFICACAO_ADMIN),
    contarNotificacoesNaoLidas(tenant.id, userId, TIPOS_NOTIFICACAO_ADMIN),
  ])

  return NextResponse.json({
    unreadNotifications,
    notifications: notifications.map((n: (typeof notifications)[number]) => ({
      ...n,
      criadoEm: n.criadoEm.toISOString(),
    })),
  })
}
