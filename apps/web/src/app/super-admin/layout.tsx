import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { SuperAdminShell } from '@/components/super-admin/super-admin-shell'
import { SuperAdminMotionShell } from '@/components/motion/super-admin-motion-shell'
import { getTenantFromHost } from '@/lib/tenant'
import { isSuperAdminEmail, listarTorcidasParaSelecao } from '@/lib/tenant-context'
import { contarPendentesSuperAdmin } from '@/lib/super-admin/pendentes-badges'

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

  const [torcidas, tenant, badges] = await Promise.all([
    listarTorcidasParaSelecao(),
    getTenantFromHost(),
    contarPendentesSuperAdmin(),
  ])

  return (
    <SuperAdminShell
      userName={session.user.name ?? null}
      userEmail={session.user.email}
      torcidaAtualSlug={tenant?.slug ?? null}
      torcidas={torcidas}
      badges={badges}
    >
      <SuperAdminMotionShell>{children}</SuperAdminMotionShell>
    </SuperAdminShell>
  )
}
