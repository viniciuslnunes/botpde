import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { contarMensagensNaoLidas } from '@/lib/mensageria'

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
    db.notificacao.findMany({
      where: { tenantId: tenant.id, userId },
      orderBy: { criadoEm: 'desc' },
      take: 8,
      select: { id: true, titulo: true, corpo: true, link: true, lida: true, criadoEm: true },
    }),
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
