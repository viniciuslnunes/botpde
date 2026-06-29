import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { superAdminEmails } from '@/lib/env'

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

  if (!session.user.email || !superAdminEmails.includes(session.user.email)) {
    redirect('/')
  }

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100">
      {/* Sidebar super-admin — tema fixo dark, independente do tenant */}
      <aside className="w-64 shrink-0 border-r border-zinc-800 bg-zinc-900">
        <div className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Super Admin
          </p>
          <p className="mt-1 text-sm font-medium text-zinc-200">Torcida SaaS</p>
        </div>
        {/* SuperAdminNav */}
      </aside>
      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  )
}
