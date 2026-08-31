import { NextResponse } from 'next/server'
import { withDbRetry } from '@torcida/db'
import { auth } from '@/lib/auth'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import { getInboxNavbar } from '@/lib/notificacoes'
import {
  remapLinkInboxPlataforma,
  TIPOS_NOTIFICACAO_PLATAFORMA,
} from '@/lib/notificacoes-plataforma'

export const dynamic = 'force-dynamic'

/** Sino cross-tenant do operador da plataforma. */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }
  if (!isSuperAdminEmail(session.user.email)) {
    return NextResponse.json({ error: 'Proibido' }, { status: 403 })
  }

  const inbox = await withDbRetry(() =>
    getInboxNavbar(null, session.user.id, TIPOS_NOTIFICACAO_PLATAFORMA, 8, {
      crossTenant: true,
    }),
  )

  return NextResponse.json({
    unreadNotifications: inbox.unreadCount,
    notifications: inbox.notifications.map((n) => ({
      ...n,
      link: remapLinkInboxPlataforma(n.link),
      criadoEm: n.criadoEm.toISOString(),
    })),
  })
}
