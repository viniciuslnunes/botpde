import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import type { Tenant } from '@torcida/db'
import type { Session } from 'next-auth'
import { getActiveTenant, getUserPermissionsInTenant } from '@/lib/tenant'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import { getDescendantTenantIds } from '@/lib/hierarquia'
import { calculateEffectivePermissions, hasPermission, PERMISSIONS } from '@torcida/types'

type AuthzResult = {
  session: Session
  tenant: Tenant
}

type VisibilidadePost = 'PUBLICO' | 'TENANT' | 'PRIVADO'

async function resolvePortalTenant(session: Session): Promise<Tenant | null> {
  return getActiveTenant(session.user.id, session.user.email)
}

/** Torcedor global ou PENDENTE no clube — posts PUBLICO no feed cross-torcida (spec §3.1). */
async function podePublicarComoTorcedorFeed(
  userId: string,
  tenantId: string,
): Promise<boolean> {
  const perfil: { onboardingConcluidoEm: Date | null; afiliacaoId: string | null } | null =
    await db.perfilTorcedor.findUnique({
      where: { userId },
      select: { onboardingConcluidoEm: true, afiliacaoId: true },
    })
  if (!perfil?.onboardingConcluidoEm) return false

  const tenant: { afiliacaoId: string | null } | null = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { afiliacaoId: true },
  })
  if (!tenant?.afiliacaoId || tenant.afiliacaoId !== perfil.afiliacaoId) return false

  const membro: { status: string } | null = await db.saasMembro.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
    select: { status: true },
  })
  if (membro?.status === 'PENDENTE') return true
  if (!membro) return true
  return false
}

/**
 * Sessão + tenant resolvidos, com o usuário logado tendo a permissão efetiva
 * indicada (perfil ou permissão adicional) no tenant atual. Único critério de
 * autorização do admin — não exige cargo de sistema, funciona com perfis
 * customizados (ver ARCHITECTURE.md item 16).
 */
export async function assertPermission(permission: string): Promise<AuthzResult> {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Não autorizado')

  const tenant = await resolvePortalTenant(session)
  if (!tenant) throw new Error('Não autorizado')

  if (isSuperAdminEmail(session.user.email)) {
    return { session, tenant }
  }

  const { rolePermissions, overrides }: { rolePermissions: string[]; overrides: { permission: string; granted: boolean }[] } =
    await getUserPermissionsInTenant(session.user.id, tenant.id)
  const effective: string[] = calculateEffectivePermissions(rolePermissions, overrides)

  if (!hasPermission(effective, permission)) throw new Error('Sem permissão')

  return { session, tenant }
}

/**
 * Igual a `assertPermission`, mas aceita qualquer uma de várias permissões (OR).
 * Usado em rotas cujo menu usa array (ex.: Eventos = CREATE || MANAGE).
 */
export async function assertAnyPermission(permissions: string[]): Promise<AuthzResult> {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Não autorizado')

  const tenant = await resolvePortalTenant(session)
  if (!tenant) throw new Error('Não autorizado')

  if (isSuperAdminEmail(session.user.email)) {
    return { session, tenant }
  }

  const { rolePermissions, overrides }: { rolePermissions: string[]; overrides: { permission: string; granted: boolean }[] } =
    await getUserPermissionsInTenant(session.user.id, tenant.id)
  const effective: string[] = calculateEffectivePermissions(rolePermissions, overrides)

  if (!permissions.some((p) => hasPermission(effective, p))) throw new Error('Sem permissão')

  return { session, tenant }
}

/**
 * Console global de leitura do Presidente (/admin/torcida): exige a permissão
 * TORCIDA_GLOBAL_VIEW (Presidente/Vice) E que o tenant atual seja a Sede
 * principal (tipo SEDE). Liderança de subsede/PDE tem owner com '*', mas não
 * passa aqui — o console é exclusivo do topo da árvore.
 */
export async function assertPresidenteGlobal(): Promise<AuthzResult> {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Não autorizado')

  const tenant = await resolvePortalTenant(session)
  if (!tenant) throw new Error('Não autorizado')

  if (isSuperAdminEmail(session.user.email)) {
    return { session, tenant }
  }

  const { rolePermissions, overrides }: { rolePermissions: string[]; overrides: { permission: string; granted: boolean }[] } =
    await getUserPermissionsInTenant(session.user.id, tenant.id)
  const effective: string[] = calculateEffectivePermissions(rolePermissions, overrides)

  if (!hasPermission(effective, PERMISSIONS.TORCIDA_GLOBAL_VIEW)) throw new Error('Sem permissão')

  // Busca explícita por tipo SEDE — findFirst sem filtro pode pegar PDE
  // co-tenant se a ordem do banco favorecer uma unidade territorial.
  const sede: { id: string } | null = await db.sede.findFirst({
    where: { tenantId: tenant.id, tipo: 'SEDE' },
    select: { id: true },
  })
  if (!sede) throw new Error('Sem permissão')

  return { session, tenant }
}

type PresidenteLeituraUnidadeResult = AuthzResult & {
  targetTenantId: string
  readOnly: true
}

/**
 * Drill-down read-only do Presidente (R1) sobre uma unidade descendente:
 * exige `assertPresidenteGlobal` (tipo SEDE + TORCIDA_GLOBAL_VIEW) e que o
 * tenant alvo esteja na árvore de descendentes da Sede. NUNCA autoriza
 * mutação — o contrato devolve `readOnly: true` para os loaders da Fase 3.
 */
export async function assertPresidentePodeLerUnidade(
  targetTenantId: string,
): Promise<PresidenteLeituraUnidadeResult> {
  const { session, tenant } = await assertPresidenteGlobal()

  if (isSuperAdminEmail(session.user.email)) {
    return { session, tenant, targetTenantId, readOnly: true as const }
  }

  const descendentes: string[] = await getDescendantTenantIds(tenant.id)
  if (!descendentes.includes(targetTenantId)) {
    throw new Error('Sem permissão')
  }

  return { session, tenant, targetTenantId, readOnly: true as const }
}

/**
 * Garante que o usuário é o owner (Presidente/Liderança) do tenant — cargo de
 * sistema 'owner'. Usado em decisões que a permissão sozinha não cobre (peso
 * final do Presidente: configurações sensíveis, afiliação de unidades).
 */
export async function assertTenantOwner(userId: string, tenantId: string): Promise<void> {
  const ownerRole: { id: string } | null = await db.userRole.findFirst({
    where: {
      userId,
      tenantId,
      role: { isSystem: true, nome: 'owner' },
    },
    select: { id: true },
  })
  if (!ownerRole) throw new Error('Apenas o owner pode alterar esta configuração')
}

/** Leitura da loja (pedidos): STORE_VIEW_ORDERS ou STORE_MANAGE. */
export async function assertStoreView(): Promise<AuthzResult> {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Não autorizado')

  const tenant = await resolvePortalTenant(session)
  if (!tenant) throw new Error('Não autorizado')

  if (isSuperAdminEmail(session.user.email)) {
    return { session, tenant }
  }

  const { rolePermissions, overrides } = await getUserPermissionsInTenant(session.user.id, tenant.id)
  const effective = calculateEffectivePermissions(rolePermissions, overrides)

  const canView = hasPermission(effective, PERMISSIONS.STORE_VIEW_ORDERS)
    || hasPermission(effective, PERMISSIONS.STORE_MANAGE)
  if (!canView) throw new Error('Sem permissão')

  return { session, tenant }
}

/**
 * Garante que o usuário tem um vínculo de associado ativo no tenant antes de
 * uma ação restrita (ex: confirmar presença em evento oficial). Carteirinha
 * e status de associação influenciam acesso: membro pendente/reprovado, ou
 * sócio com carteirinha vencida, não pode executar a ação.
 */
export async function assertMembroAtivo(tenantId: string, userId: string): Promise<void> {
  const membro = await db.saasMembro.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
    select: { status: true, tipo: true },
  })

  if (!membro) throw new Error('Você precisa ser associado desta torcida para essa ação.')
  if (membro.status !== 'APROVADO') {
    throw new Error('Seu cadastro de associado ainda não foi aprovado.')
  }

  if (membro.tipo === 'SOCIO') {
    const socio = await db.saasSocio.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { validade: true },
    })
    if (socio && socio.validade < new Date()) {
      throw new Error('Sua carteirinha está vencida. Regularize para continuar.')
    }
  }
}

/** Publicar no feed: permissão `community:post` + membro APROVADO (e carteirinha válida se sócio). */
export async function assertPodePublicarNoFeed(): Promise<AuthzResult> {
  const ctx = await assertPermission(PERMISSIONS.COMMUNITY_POST)
  await assertMembroAtivo(ctx.tenant.id, ctx.session.user.id)
  return ctx
}

/**
 * Autor de post no feed: membro aprovado (qualquer visibilidade) ou torcedor
 * (somente PUBLICO enquanto aguarda aprovação / sem vínculo de sócio).
 */
export async function assertAutorPublicacaoPost(
  visibilidade: VisibilidadePost,
): Promise<AuthzResult> {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Não autorizado')

  const tenant = await resolvePortalTenant(session)
  if (!tenant) throw new Error('Não autorizado')

  if (isSuperAdminEmail(session.user.email)) {
    return { session, tenant }
  }

  const membro: { status: string } | null = await db.saasMembro.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId: session.user.id } },
    select: { status: true },
  })

  const { rolePermissions, overrides } = await getUserPermissionsInTenant(
    session.user.id,
    tenant.id,
  )
  const effective = calculateEffectivePermissions(rolePermissions, overrides)
  const temPermissao = hasPermission(effective, PERMISSIONS.COMMUNITY_POST)

  if (membro?.status === 'APROVADO' && temPermissao) {
    await assertMembroAtivo(tenant.id, session.user.id)
    return { session, tenant }
  }

  if (visibilidade !== 'PUBLICO') {
    throw new Error(
      'Enquanto seu vínculo não for aprovado, publique apenas posts públicos no feed de torcedor.',
    )
  }

  if (await podePublicarComoTorcedorFeed(session.user.id, tenant.id)) {
    return { session, tenant }
  }

  if (membro?.status === 'PENDENTE') {
    throw new Error('Seu vínculo ainda está em análise.')
  }
  if (membro && membro.status !== 'APROVADO') {
    throw new Error('Seu cadastro de associado não está ativo.')
  }
  throw new Error('Conclua o onboarding do torcedor para publicar.')
}

/**
 * Checagem read-only para UI — retorna mensagem de bloqueio ou `null` se pode publicar.
 */
export async function checarPodePublicarNoFeed(
  userId: string,
  tenantId: string,
): Promise<string | null> {
  const membro: { status: string } | null = await db.saasMembro.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
    select: { status: true },
  })

  const { rolePermissions, overrides } = await getUserPermissionsInTenant(userId, tenantId)
  const effective = calculateEffectivePermissions(rolePermissions, overrides)
  const temPermissao = hasPermission(effective, PERMISSIONS.COMMUNITY_POST)

  if (membro?.status === 'APROVADO' && temPermissao) {
    try {
      await assertMembroAtivo(tenantId, userId)
      return null
    } catch (error) {
      return error instanceof Error ? error.message : 'Não é possível publicar.'
    }
  }

  if (await podePublicarComoTorcedorFeed(userId, tenantId)) {
    return null
  }

  if (membro?.status === 'PENDENTE') {
    return 'Seu vínculo ainda está em análise. Publicar libera quando a torcida aprovar seu cadastro.'
  }
  if (membro && membro.status !== 'APROVADO') {
    return 'Seu cadastro de associado não está ativo.'
  }
  if (membro && !temPermissao) {
    return 'Você não tem permissão para publicar.'
  }
  return 'Conclua o onboarding do torcedor para publicar no feed.'
}
