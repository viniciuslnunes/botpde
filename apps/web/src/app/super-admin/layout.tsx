import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { SuperAdminShell } from '@/components/super-admin/super-admin-shell'
import { SuperAdminMotionShell } from '@/components/motion/super-admin-motion-shell'
import { getTenantFromHost } from '@/lib/tenant'
import {
  isSuperAdminEmail,
  listarClubesParaSelecao,
  listarTorcidasParaSelecao,
} from '@/lib/tenant-context'
import { listarUnidadesParaSelecao } from '@/lib/admin-context-unidades'
import { contarPendentesSuperAdmin } from '@/lib/super-admin/pendentes-badges'
import { getInboxNavbar } from '@/lib/notificacoes'
import {
  remapLinkInboxPlataforma,
  TIPOS_NOTIFICACAO_PLATAFORMA,
} from '@/lib/notificacoes-plataforma'
import type { UnidadeOpcao } from '@/lib/torcida-labels'

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

  const [torcidas, clubes, tenant, badges, inbox] = await Promise.all([
    listarTorcidasParaSelecao(),
    listarClubesParaSelecao(),
    getTenantFromHost(),
    contarPendentesSuperAdmin(),
    getInboxNavbar(null, session.user.id, TIPOS_NOTIFICACAO_PLATAFORMA, 8, {
      crossTenant: true,
    }),
  ])

  const unidades: UnidadeOpcao[] = tenant
    ? await listarUnidadesParaSelecao(tenant.id)
    : []

  return (
    <SuperAdminShell
      userName={session.user.name ?? null}
      userEmail={session.user.email}
      torcidaAtualSlug={tenant?.slug ?? null}
      tenantAtualId={tenant?.id ?? null}
      torcidas={torcidas}
      clubes={clubes}
      unidades={unidades}
      badges={badges}
      notifications={inbox.notifications.map((n) => ({
        ...n,
        link: remapLinkInboxPlataforma(n.link),
      }))}
    >
      <SuperAdminMotionShell>{children}</SuperAdminMotionShell>
    </SuperAdminShell>
  )
}
