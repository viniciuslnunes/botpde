import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { SuperAdminShell } from '@/components/super-admin/super-admin-shell'
import { SuperAdminMotionShell } from '@/components/motion/super-admin-motion-shell'
import { getTenantFromHost } from '@/lib/tenant'
import {
  isSuperAdminEmail,
  listarClubesParaSelecao,
  listarTorcidasParaSelecaoSemente,
} from '@/lib/tenant-context'
import { listarUnidadesParaSelecao } from '@/lib/admin-context-unidades'
import { contarPendentesSuperAdmin } from '@/lib/super-admin/pendentes-badges'
import { getInboxNavbar } from '@/lib/notificacoes'
import {
  remapLinkInboxPlataforma,
  TIPOS_NOTIFICACAO_PLATAFORMA,
} from '@/lib/notificacoes-plataforma'
import type { ClubeOpcao, TorcidaOpcao, UnidadeOpcao } from '@/lib/torcida-labels'

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

  // `getTenantFromHost` é `React.cache` e resolve em uma busca por slug; sai
  // do `Promise.all` porque a semente do switcher e as unidades dependem dele —
  // e assim as duas passam a correr juntas, em vez de a segunda esperar a
  // primeira como antes.
  const tenant = await getTenantFromHost()

  const [torcidas, clubes, unidades, badges, inbox]: [
    TorcidaOpcao[],
    ClubeOpcao[],
    UnidadeOpcao[],
    Awaited<ReturnType<typeof contarPendentesSuperAdmin>>,
    Awaited<ReturnType<typeof getInboxNavbar>>,
  ] = await Promise.all([
    // Semente, não lista inteira: as centenas restantes chegam por busca sob
    // demanda no próprio switcher (ver `listarTorcidasParaSelecaoSemente`).
    listarTorcidasParaSelecaoSemente(tenant?.slug ?? null),
    listarClubesParaSelecao(),
    tenant ? listarUnidadesParaSelecao(tenant.id) : Promise.resolve([]),
    contarPendentesSuperAdmin(),
    getInboxNavbar(null, session.user.id, TIPOS_NOTIFICACAO_PLATAFORMA, 8, {
      crossTenant: true,
    }),
  ])

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
