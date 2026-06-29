import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { PortalNavbar } from '@/components/portal/navbar'

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

  return (
    <div className="min-h-screen bg-[rgb(var(--background-subtle))]">
      <PortalNavbar
        userName={session.user.name ?? null}
        userAvatar={session.user.image ?? null}
        tenantNome={tenant?.nome ?? 'Torcida'}
        tenantCor={tenant?.corPrimaria ?? '#7c3aed'}
        isAdmin={isAdmin}
      />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  )
}
