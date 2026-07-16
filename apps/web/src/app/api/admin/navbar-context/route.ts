import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'
import { listarNotificacoesRecentes } from '@/lib/notificacoes'
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

  const notifications = await listarNotificacoesRecentes(
    tenant.id,
    session.user.id,
    8,
    TIPOS_NOTIFICACAO_ADMIN,
  )

  return NextResponse.json({
    notifications: notifications.map((n: (typeof notifications)[number]) => ({
      ...n,
      criadoEm: n.criadoEm.toISOString(),
    })),
  })
}
