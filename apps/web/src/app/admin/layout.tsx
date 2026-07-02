import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getTenantFromHost, getUserPermissionsInTenant } from '@/lib/tenant'
import { AdminSidebar } from '@/components/admin/sidebar'
import { ADMIN_MENU, calculateEffectivePermissions, filterMenuByPermissions, hasAdminAreaAccess } from '@torcida/types'

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

  const { rolePermissions, overrides } = await getUserPermissionsInTenant(session.user.id, tenant.id)
  const effectivePermissions = calculateEffectivePermissions(rolePermissions, overrides)

  if (!hasAdminAreaAccess(effectivePermissions)) {
    redirect('/portal')
  }

  const menuItems = filterMenuByPermissions(ADMIN_MENU, effectivePermissions)

  return (
    <div className="flex h-screen overflow-hidden bg-[rgb(var(--background-subtle))]">
      <AdminSidebar tenantNome={tenant.nome} tenantCor={tenant.corPrimaria} items={menuItems} />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
