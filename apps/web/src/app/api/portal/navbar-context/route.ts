import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getUserPermissionsInTenant } from '@/lib/tenant'
import { contarMensagensNaoLidas } from '@/lib/mensageria'
import { getInboxNavbar } from '@/lib/notificacoes'
import { tiposInboxPortal } from '@/lib/notificacoes-comunidade'
import { calculateEffectivePermissions, hasAdminAreaAccess } from '@torcida/types'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import { resolveTenantIdPortalComunidade } from '@/lib/comunidade-contexto'

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const userId = session.user.id
    const tenantId = await resolveTenantIdPortalComunidade(userId, session.user.email)
    if (!tenantId) {
      // Super-admin sem torcida/CN: navbar ainda monta; não 404 (evita ruído e
      // loops de refetch). Contadores vazios + acesso admin de plataforma.
      if (isSuperAdminEmail(session.user.email)) {
        return NextResponse.json({
          unreadMessages: 0,
          unreadNotifications: 0,
          hasAdminAreaAccess: true,
          isAdmin: true,
          notifications: [],
        })
      }
      return NextResponse.json({ error: 'Tenant não encontrado' }, { status: 404 })
    }

    const isSuperAdmin = isSuperAdminEmail(session.user.email)
    const { rolePermissions, overrides } = await getUserPermissionsInTenant(userId, tenantId)
    const effectivePermissions = calculateEffectivePermissions(rolePermissions, overrides)
    const hasAdminAreaAccessFlag =
      isSuperAdmin || hasAdminAreaAccess(effectivePermissions)

    const tiposInbox = tiposInboxPortal(hasAdminAreaAccessFlag)

    const [unreadMessages, inbox] = await Promise.all([
      contarMensagensNaoLidas(userId).catch((): number => 0),
      getInboxNavbar(tenantId, userId, tiposInbox, 8, { portalComCn: true }),
    ])

    return NextResponse.json({
      unreadMessages,
      unreadNotifications: inbox.unreadCount,
      hasAdminAreaAccess: hasAdminAreaAccessFlag,
      /** @deprecated Use hasAdminAreaAccess — mantido para compatibilidade do client. */
      isAdmin: hasAdminAreaAccessFlag,
      notifications: inbox.notifications.map((n) => ({
        ...n,
        criadoEm: n.criadoEm.toISOString(),
      })),
    })
  } catch (error) {
    console.error('[api/portal/navbar-context]', error)
    return NextResponse.json({ error: 'Erro ao carregar contexto da navbar' }, { status: 500 })
  }
}
