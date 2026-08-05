import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getActiveTenant, getUserPermissionsInTenant, resolveTenantLogoUrl } from '@/lib/tenant'
import { tenantIsAdministracaoSede } from '@/lib/authz'
import { AdminShell } from '@/components/admin/admin-shell'
import { AdminMotionShell } from '@/components/motion/admin-motion-shell'
import { AdminRouteTransition } from '@/components/motion/admin-route-transition'
import {
  ADMIN_MENU,
  calculateEffectivePermissions,
  filterMenuByPermissionsAndGestoria,
  hasAdminAreaAccess,
  hasPermission,
  PERMISSIONS,
} from '@torcida/types'
import { listarSlugsGestoriaNoTenant } from '@/lib/departamentos-gestoria'
import {
  isSuperAdminEmail,
  listarClubesParaSelecao,
  listarTorcidasParaSelecao,
  usuarioPrecisaNickname,
} from '@/lib/tenant-context'
import { listarVinculosAdminDoUsuario } from '@/lib/admin-vinculos'
import { listarUnidadesParaSelecao } from '@/lib/admin-context-unidades'
import { listarNotificacoesRecentes } from '@/lib/notificacoes'
import { TIPOS_NOTIFICACAO_ADMIN } from '@/lib/notificacoes-comunidade'
import { getAvatarAtualDoUsuario, getNomeAtualDoUsuario } from '@/lib/perfil-social'

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

  const tenant = await getActiveTenant(session.user.id, session.user.email)

  if (!tenant) {
    if (isSuperAdmin) redirect('/super-admin/torcidas')
    redirect('/')
  }

  const { rolePermissions, overrides } = await getUserPermissionsInTenant(session.user.id, tenant.id)
  const effectivePermissions = calculateEffectivePermissions(rolePermissions, overrides)

  if (!isSuperAdmin && !hasAdminAreaAccess(effectivePermissions)) {
    redirect('/portal')
  }

  // Console global e afiliações só existem na Sede principal (tipo SEDE).
  // Liderança de subsede/PDE tem owner ('*'), mas o item some e a rota bloqueia.
  let tenantEhSedePrincipal = isSuperAdmin
  if (
    !isSuperAdmin &&
    (hasPermission(effectivePermissions, PERMISSIONS.TORCIDA_GLOBAL_VIEW) ||
      hasPermission(effectivePermissions, PERMISSIONS.AFFILIATION_MANAGE))
  ) {
    tenantEhSedePrincipal = await tenantIsAdministracaoSede(tenant.id)
  }

  // O módulo Estrutura tem etapas que existem em qualquer unidade (Unidades,
  // Hierarquia) e etapas exclusivas da Sede principal (Visão da torcida,
  // Solicitações). Só some do menu quem não alcança nenhuma delas.
  const exibirEstrutura =
    isSuperAdmin ||
    hasPermission(effectivePermissions, PERMISSIONS.SEDES_VIEW) ||
    hasPermission(effectivePermissions, PERMISSIONS.SEDES_MANAGE) ||
    hasPermission(effectivePermissions, PERMISSIONS.ROLES_MANAGE) ||
    (tenantEhSedePrincipal &&
      (hasPermission(effectivePermissions, PERMISSIONS.TORCIDA_GLOBAL_VIEW) ||
        hasPermission(effectivePermissions, PERMISSIONS.AFFILIATION_MANAGE)))

  const podeGerirTodos =
    isSuperAdmin || hasPermission(effectivePermissions, PERMISSIONS.ROLES_MANAGE)
  const gestorSlugs = isSuperAdmin
    ? []
    : await listarSlugsGestoriaNoTenant(session.user.id, tenant.id)
  const menuBase = isSuperAdmin
    ? ADMIN_MENU
    : filterMenuByPermissionsAndGestoria(ADMIN_MENU, effectivePermissions, {
        gestorSlugs,
        podeGerirTodos,
      })
  const menuItems = menuBase
    .filter((item) => item.id !== 'estrutura' || exibirEstrutura)
    .map((item) => ({
      id: item.id,
      label: item.label,
      href: item.href,
      secao: item.secao,
      ...('exact' in item && item.exact ? { exact: true as const } : {}),
    }))

  const [torcidas, clubes, unidades] = isSuperAdmin
    ? await Promise.all([
        listarTorcidasParaSelecao(),
        listarClubesParaSelecao(),
        listarUnidadesParaSelecao(tenant.id),
      ])
    : [[], [], []]
  // Só torcidas onde há área admin — espelho Caso B `member` na Sede some.
  const vinculos = isSuperAdmin ? [] : await listarVinculosAdminDoUsuario(session.user.id)
  const notifications = await listarNotificacoesRecentes(
    tenant.id,
    session.user.id,
    8,
    TIPOS_NOTIFICACAO_ADMIN,
  )
  const [avatarUrl, userName, tenantLogoUrl] = await Promise.all([
    getAvatarAtualDoUsuario(session.user.id),
    getNomeAtualDoUsuario(session.user.id),
    resolveTenantLogoUrl(tenant.id, tenant.logoUrl),
  ])

  return (
    <AdminShell
      tenantNome={tenant.nome}
      tenantCor={tenant.corPrimaria}
      tenantSlug={tenant.slug}
      tenantId={tenant.id}
      tenantLogoUrl={tenantLogoUrl}
      tenantDesign={tenant.design}
      userName={userName ?? session.user.name ?? null}
      userAvatar={avatarUrl}
      items={menuItems}
      isSuperAdmin={isSuperAdmin}
      torcidas={torcidas}
      clubes={clubes}
      unidades={unidades}
      vinculos={vinculos}
      notifications={notifications}
      operatorBanner={
        isSuperAdmin ? (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200 sm:px-6">
            Modo operador — gerenciando <strong>{tenant.nome}</strong>. Dados confidenciais
            ficam isolados por torcida
            <span className="hidden sm:inline">; troque no seletor ao lado</span>
            <span className="sm:hidden"> — abra o menu para trocar de torcida</span>.
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
