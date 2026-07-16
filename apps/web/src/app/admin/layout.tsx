import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { getTenantFromHost, getUserPermissionsInTenant } from '@/lib/tenant'
import { AdminShell } from '@/components/admin/admin-shell'
import { AdminMotionShell } from '@/components/motion/admin-motion-shell'
import { AdminRouteTransition } from '@/components/motion/admin-route-transition'
import {
  ADMIN_MENU,
  calculateEffectivePermissions,
  filterMenuByPermissions,
  hasAdminAreaAccess,
  hasPermission,
  PERMISSIONS,
} from '@torcida/types'
import { isSuperAdminEmail, listarTorcidasParaSelecao, usuarioPrecisaNickname } from '@/lib/tenant-context'
import { listarNotificacoesRecentes } from '@/lib/notificacoes'
import { TIPOS_NOTIFICACAO_ADMIN } from '@/lib/notificacoes-comunidade'

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

  // Operadores (super-admin) não precisam de @; líderes de torcida sim.
  if (!isSuperAdmin && session.user.id && (await usuarioPrecisaNickname(session.user.id))) {
    redirect('/definir-apelido')
  }

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

  // 'Visão da torcida' é o console global do Presidente — só existe na Sede
  // principal. Liderança de subsede/PDE tem a permissão via owner ('*'), mas
  // o item some (e a rota bloqueia via assertPresidenteGlobal). Super-admin vê sempre.
  let exibirConsoleTorcida = isSuperAdmin
  if (!isSuperAdmin && hasPermission(effectivePermissions, PERMISSIONS.TORCIDA_GLOBAL_VIEW)) {
    const sede: { id: string } | null = await db.sede.findFirst({
      where: { tenantId: tenant.id, tipo: 'SEDE' },
      select: { id: true },
    })
    exibirConsoleTorcida = sede !== null
  }

  const menuBase = isSuperAdmin ? ADMIN_MENU : filterMenuByPermissions(ADMIN_MENU, effectivePermissions)
  const menuItems = menuBase
    .filter((item) => item.id !== 'torcida' || exibirConsoleTorcida)
    .map((item) => ({
      id: item.id,
      label: item.label,
      href: item.href,
      secao: item.secao,
      ...('exact' in item && item.exact ? { exact: true as const } : {}),
    }))

  const torcidas = isSuperAdmin ? await listarTorcidasParaSelecao() : []
  const notifications = await listarNotificacoesRecentes(
    tenant.id,
    session.user.id,
    8,
    TIPOS_NOTIFICACAO_ADMIN,
  )

  return (
    <AdminShell
      tenantNome={tenant.nome}
      tenantCor={tenant.corPrimaria}
      tenantSlug={tenant.slug}
      tenantLogoUrl={tenant.logoUrl}
      userName={session.user.name ?? null}
      userAvatar={session.user.image ?? null}
      items={menuItems}
      isSuperAdmin={isSuperAdmin}
      torcidas={torcidas}
      notifications={notifications}
      operatorBanner={
        isSuperAdmin ? (
          <div className="border-b border-amber-200 bg-amber-50 px-6 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            Modo operador — gerenciando <strong>{tenant.nome}</strong>. Dados confidenciais
            ficam isolados por torcida; troque no seletor ao lado.
          </div>
        ) : null
      }
    >
      <AdminMotionShell>
        <AdminRouteTransition>{children}</AdminRouteTransition>
      </AdminMotionShell>
    </AdminShell>
  )
}
