import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { contarMensagensNaoLidas } from '@/lib/mensageria'
import { listarNotificacoesRecentes } from '@/lib/notificacoes'
import { TIPOS_NOTIFICACAO_SOCIAL } from '@/lib/notificacoes-comunidade'

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

  const [unreadMessages, notifications, isAdmin] = await Promise.all([
    contarMensagensNaoLidas(userId).catch((): number => 0),
    listarNotificacoesRecentes(tenant.id, userId, 8, TIPOS_NOTIFICACAO_SOCIAL),
    db.userRole
      .findFirst({
        where: {
          userId,
          tenantId: tenant.id,
          role: { isSystem: true, nome: { in: ['owner', 'admin'] } },
        },
      })
      .then((role: { id: string } | null) => !!role),
  ])

  return NextResponse.json({
    unreadMessages,
    isAdmin,
    notifications: notifications.map((n: (typeof notifications)[number]) => ({
      ...n,
      criadoEm: n.criadoEm.toISOString(),
    })),
  })
}
