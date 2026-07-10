import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { contarMensagensNaoLidas } from '@/lib/mensageria'
import { PortalNavbar } from '@/components/portal/navbar'
import type { NotificationItem } from '@/components/portal/notification-bell'

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  if (!session?.user) {
    redirect('/entrar')
  }

  const tenant = await getTenantFromHost()
  const notifications: NotificationItem[] =
    tenant && session.user.id
      ? await db.notificacao.findMany({
          where: { tenantId: tenant.id, userId: session.user.id },
          orderBy: { criadoEm: 'desc' },
          take: 8,
          select: { id: true, titulo: true, corpo: true, link: true, lida: true, criadoEm: true },
        })
      : []

  // Verifica se é admin para exibir o link na navbar
  const isAdmin = tenant
    ? !!(await db.userRole.findFirst({
        where: {
          userId: session.user.id,
          tenantId: tenant.id,
          role: { isSystem: true, nome: { in: ['owner', 'admin'] } },
        },
      }))
    : false

  // Best-effort: se a migração da mensageria ainda não rodou neste banco,
  // o badge fica em 0 em vez de derrubar o portal inteiro.
  let unreadMessages = 0
  if (session.user.id) {
    try {
      unreadMessages = await contarMensagensNaoLidas(session.user.id)
    } catch {
      unreadMessages = 0
    }
  }

  return (
    <div className="min-h-screen bg-[rgb(var(--background-subtle))]">
      <PortalNavbar
        userName={session.user.name ?? null}
        userAvatar={session.user.image ?? null}
        tenantNome={tenant?.nome ?? 'Torcida'}
        tenantCor={tenant?.corPrimaria ?? '#7c3aed'}
        isAdmin={isAdmin}
        notifications={notifications}
        unreadMessages={unreadMessages}
      />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  )
}
