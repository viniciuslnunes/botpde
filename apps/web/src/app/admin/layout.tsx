import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'

/**
 * Layout da Administração da Torcida.
 * Apenas owner e admin têm acesso.
 * Middleware já bloqueia non-autenticados — aqui verificamos o role.
 */
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

  // Verifica se o usuário tem role de owner ou admin neste tenant
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
    <div className="flex min-h-screen" style={{ backgroundColor: 'rgb(var(--background-subtle))' }}>
      {/* Sidebar de admin — será implementada como componente separado */}
      <aside className="w-64 shrink-0 border-r border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
        {/* AdminSidebar */}
      </aside>
      <main className="flex-1 overflow-auto p-8">
        {children}
      </main>
    </div>
  )
}
