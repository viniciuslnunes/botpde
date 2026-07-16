import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getTenantFromHost, getUserPermissionsInTenant } from '@/lib/tenant'
import { contarMensagensNaoLidas } from '@/lib/mensageria'
import { listarNotificacoesRecentes } from '@/lib/notificacoes'
import {
  contarNotificacoesPortalNaoLidas,
  tiposInboxPortal,
} from '@/lib/notificacoes-comunidade'
import { calculateEffectivePermissions, hasAdminAreaAccess } from '@torcida/types'
import { isSuperAdminEmail } from '@/lib/tenant-context'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const tenant = await getTenantFromHost()
  if (!tenant) {
    return NextResponse.json({ error: 'Tenant não encontrado' }, { status: 404 })
  }

  const userId = session.user.id
  const isSuperAdmin = isSuperAdminEmail(session.user.email)

  const { rolePermissions, overrides } = await getUserPermissionsInTenant(userId, tenant.id)
  const effectivePermissions = calculateEffectivePermissions(rolePermissions, overrides)
  const hasAdminAreaAccessFlag =
    isSuperAdmin || hasAdminAreaAccess(effectivePermissions)

  const tiposInbox = tiposInboxPortal(hasAdminAreaAccessFlag)

  const [unreadMessages, notifications, unreadNotifications] = await Promise.all([
    contarMensagensNaoLidas(userId).catch((): number => 0),
    listarNotificacoesRecentes(tenant.id, userId, 8, tiposInbox),
    contarNotificacoesPortalNaoLidas(tenant.id, userId, hasAdminAreaAccessFlag),
  ])

  return NextResponse.json({
    unreadMessages,
    unreadNotifications,
    hasAdminAreaAccess: hasAdminAreaAccessFlag,
    /** @deprecated Use hasAdminAreaAccess — mantido para compatibilidade do client. */
    isAdmin: hasAdminAreaAccessFlag,
    notifications: notifications.map((n: (typeof notifications)[number]) => ({
      ...n,
      criadoEm: n.criadoEm.toISOString(),
    })),
  })
}
