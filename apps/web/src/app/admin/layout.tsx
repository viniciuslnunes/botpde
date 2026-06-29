import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { AdminSidebar } from '@/components/admin/sidebar'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  if (!session?.user) {
    redirect('/entrar')
  }

  const tenant = await getTenantFromHost()

  if (!tenant) {
    redirect('/')
  }

  const userRole = await db.userRole.findFirst({
    where: {
      userId: session.user.id,
      tenantId: tenant.id,
      role: {
        isSystem: true,
        nome: { in: ['owner', 'admin'] },
      },
    },
  })

  if (!userRole) {
    redirect('/portal')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[rgb(var(--background-subtle))]">
      <AdminSidebar tenantNome={tenant.nome} tenantCor={tenant.corPrimaria} />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
