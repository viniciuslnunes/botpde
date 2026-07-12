import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getTenantFromHost, getUserPermissionsInTenant } from '@/lib/tenant'
import { AdminSidebar } from '@/components/admin/sidebar'
import {
  ADMIN_MENU,
  calculateEffectivePermissions,
  filterMenuByPermissions,
  hasAdminAreaAccess,
} from '@torcida/types'
import { isSuperAdminEmail, listarTorcidasParaSelecao } from '@/lib/tenant-context'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  if (!session?.user) {
    redirect('/entrar')
  }

  const isSuperAdmin = isSuperAdminEmail(session.user.email)
  const tenant = await getTenantFromHost()

  if (!tenant) {
    if (isSuperAdmin) redirect('/super-admin/torcidas')
    redirect('/')
  }

  const { rolePermissions, overrides } = await getUserPermissionsInTenant(session.user.id, tenant.id)
  const effectivePermissions = calculateEffectivePermissions(rolePermissions, overrides)

  if (!isSuperAdmin && !hasAdminAreaAccess(effectivePermissions)) {
    redirect('/portal')
  }

  const menuItems = isSuperAdmin
    ? ADMIN_MENU.map((item) => ({
        id: item.id,
        label: item.label,
        href: item.href,
        ...('exact' in item && item.exact ? { exact: true as const } : {}),
      }))
    : filterMenuByPermissions(ADMIN_MENU, effectivePermissions)

  const torcidas = isSuperAdmin ? await listarTorcidasParaSelecao() : []

  return (
    <div className="flex h-screen overflow-hidden bg-[rgb(var(--background-subtle))]">
      <AdminSidebar
        tenantNome={tenant.nome}
        tenantCor={tenant.corPrimaria}
        tenantSlug={tenant.slug}
        items={menuItems}
        isSuperAdmin={isSuperAdmin}
        torcidas={torcidas}
      />
      <main className="flex-1 overflow-auto">
        {isSuperAdmin && (
          <div className="border-b border-amber-200 bg-amber-50 px-6 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            Modo operador — gerenciando <strong>{tenant.nome}</strong>. Dados confidenciais
            ficam isolados por torcida; troque no seletor ao lado.
          </div>
        )}
        {children}
      </main>
    </div>
  )
}
