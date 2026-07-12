import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { SuperAdminNav } from '@/components/super-admin/super-admin-nav'
import { TenantSwitcher } from '@/components/admin/tenant-switcher'
import { getTenantFromHost } from '@/lib/tenant'
import { isSuperAdminEmail, listarTorcidasParaSelecao } from '@/lib/tenant-context'

/**
 * Layout do Super Admin (operador do SaaS).
 * Acesso restrito a usuários com flag isSuperAdmin no banco.
 * Completamente isolado dos layouts de tenant.
 */
export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  if (!session?.user) {
    redirect('/entrar')
  }

  if (!session.user.email || !isSuperAdminEmail(session.user.email)) {
    redirect('/')
  }

  const [torcidas, tenant] = await Promise.all([
    listarTorcidasParaSelecao(),
    getTenantFromHost(),
  ])

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100">
      <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900">
        <div className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Super Admin
          </p>
          <p className="mt-1 text-sm font-medium text-zinc-200">Torcida SaaS</p>
        </div>
        <SuperAdminNav />
        {torcidas.length > 0 && (
          <div className="mt-auto border-t border-zinc-800 p-4">
            <TenantSwitcher
              torcidas={torcidas}
              torcidaAtualSlug={tenant?.slug ?? null}
              destino="admin"
              variant="super-admin"
            />
          </div>
        )}
      </aside>
      <main className="app-shell-bg flex-1 overflow-auto">
        <div className="app-container py-8">{children}</div>
      </main>
    </div>
  )
}
