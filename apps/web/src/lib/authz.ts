import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import type { Tenant } from '@torcida/db'
import type { Session } from 'next-auth'
import { getActiveTenant, getUserPermissionsInTenant } from '@/lib/tenant'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import { getAncestorTenantIds, getDescendantTenantIds } from '@/lib/hierarquia'
import { getOrCreateComunidadeNacionalTenant } from '@/lib/comunidade-contexto'
import {
  calculateEffectivePermissions,
  hasPermission,
  labelPermission,
  permissoesForaDoAlcance,
  PERMISSIONS,
} from '@torcida/types'

type AuthzResult = {
  session: Session
  tenant: Tenant
  /**
   * Conjunto efetivo do ator. Evita 2ª leitura de RBAC no caminho crítico de
   * publicação, e é o que limita a delegação (`permissoesForaDoAlcance`).
   * `undefined` quando o ator é super-admin — aí `isSuperAdmin` é a resposta.
   */
  permissoesEfetivas?: ReturnType<typeof calculateEffectivePermissions>
  /** Super-admin opera fora do RBAC por tenant: nenhum limite de delegação. */
  isSuperAdmin?: boolean
}

export type AuthzComunidadeNacional = {
  session: Session
  afiliacaoId: string
  tenantSintetico: { id: string }
}

type VisibilidadePost = 'PUBLICO' | 'TENANT' | 'PRIVADO'

async function resolvePortalTenant(session: Session): Promise<Tenant | null> {
  return getActiveTenant(session.user.id, session.user.email)
}

/**
 * Torcedor global ou PENDENTE no clube — posts PUBLICO no feed cross-torcida
 * (spec §3.1).
 *
 * Membro **APROVADO** nunca passa por aqui (`return false` no fim): para ele o
 * conjunto efetivo de permissões é a palavra final, inclusive em PUBLICO — um
 * override negado de `community:post` bloqueia toda visibilidade. Já quem é
 * PENDENTE ou não tem vínculo publica PUBLICO mesmo com o override negado, e
 * isso é deliberado: o override é **por torcida**, e este caminho é o feed
 * nacional do torcedor, que não pertence a nenhuma. Ver
 * `docs/ops/auditoria-funcional-2026-07.md` §Achado 7.
 */
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
    return { session, tenant, isSuperAdmin: true }
  }

  const { rolePermissions, overrides }: { rolePermissions: string[]; overrides: { permission: string; granted: boolean }[] } =
    await getUserPermissionsInTenant(session.user.id, tenant.id)
  const effective: string[] = calculateEffectivePermissions(rolePermissions, overrides)

  if (!hasPermission(effective, permission)) throw new Error('Sem permissão')

  return { session, tenant, permissoesEfetivas: effective, isSuperAdmin: false }
}

/**
 * Ninguém delega o que não tem: barra conceder permissão (ou atribuir cargo
 * que a carregue) fora do conjunto efetivo do ator.
 *
 * `roles:manage` sem este limite equivale a owner — o portador fabrica um
 * cargo com qualquer permissão do catálogo, veste, e escala. E como o cargo de
 * sistema `owner` também é atribuível, a escalada alcançava até
 * `assertTenantOwner`. Ver `docs/ops/auditoria-funcional-2026-07.md` §Achado 6.
 *
 * Super-admin passa direto (opera fora do RBAC por tenant). Owner tem `'*'`,
 * então `permissoesForaDoAlcance` já devolve vazio para ele.
 */
export function assertPodeDelegar(
  ctx: Pick<AuthzResult, 'permissoesEfetivas' | 'isSuperAdmin'>,
  desejadas: string[],
  oQue: string,
): void {
  if (ctx.isSuperAdmin) return

  const fora = permissoesForaDoAlcance(ctx.permissoesEfetivas ?? [], desejadas)
  if (fora.length === 0) return

  const lista = fora.map((p) => labelPermission(p)).join(', ')
  throw new Error(
    `Você não pode conceder ${oQue} permissões que não tem: ${lista}. Peça a quem já as tem.`,
  )
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
    return { session, tenant, isSuperAdmin: true }
  }

  const { rolePermissions, overrides }: { rolePermissions: string[]; overrides: { permission: string; granted: boolean }[] } =
    await getUserPermissionsInTenant(session.user.id, tenant.id)
  const effective: string[] = calculateEffectivePermissions(rolePermissions, overrides)

  if (!permissions.some((p) => hasPermission(effective, p))) throw new Error('Sem permissão')

  return { session, tenant, permissoesEfetivas: effective, isSuperAdmin: false }
}

/**
 * Gate de módulos admin onde `*:view` é portal, e oversight admin exige
 * `view` + `audit:view` (Diretoria) — ou `*:manage` para operar.
 */
export async function assertManageOrOversightView(
  managePerm: string,
  viewPerm: string,
): Promise<AuthzResult & { podeGerir: boolean }> {
  try {
    const authz = await assertPermission(managePerm)
    return { ...authz, podeGerir: true }
  } catch {
    const authz = await assertAnyPermission([viewPerm])
    if (
      !authz.isSuperAdmin &&
      !hasPermission(authz.permissoesEfetivas ?? [], PERMISSIONS.AUDIT_VIEW)
    ) {
      throw new Error('Sem permissão')
    }
    return { ...authz, podeGerir: Boolean(authz.isSuperAdmin) }
  }
}

/**
 * Tenant da administração central (Sede principal): possui registro `Sede` com
 * `tipo: 'SEDE'`. Subsedes e PDEs promovidos a portal próprio não passam —
 * alinhado a `assertPresidenteGlobal` e ao gate de `/admin/afiliacoes`.
 */
export async function tenantIsAdministracaoSede(tenantId: string): Promise<boolean> {
  const sede: { id: string } | null = await db.sede.findFirst({
    where: { tenantId, tipo: 'SEDE' },
    select: { id: true },
  })
  return sede !== null
}

/**
 * Gerenciar alianças (propor/aceitar/rejeitar/cancelar/encerrar): exige
 * ALLIANCES_MANAGE E que o tenant atual seja a Sede raiz — Subsede/PDE
 * apenas herdam a visualização das alianças da sede (leitura em
 * `listAliancasForTenant` a partir do tenant raiz), nunca gerenciam.
 */
export async function assertAliancasManage(): Promise<AuthzResult> {
  const ctx = await assertPermission(PERMISSIONS.ALLIANCES_MANAGE)

  if (isSuperAdminEmail(ctx.session.user.email)) {
    return ctx
  }

  const ancestrais = await getAncestorTenantIds(ctx.tenant.id)
  if (ancestrais.length > 0) {
    throw new Error('Somente a sede pode gerenciar alianças — subsedes e PDEs apenas visualizam.')
  }

  return ctx
}

/**
 * Decidir solicitações de afiliação de unidade (/admin/afiliacoes): exige
 * AFFILIATION_MANAGE E que o tenant atual seja a Sede raiz — Subsede/PDE
 * (promovida a tenant próprio) não valida afiliação de outras unidades,
 * só a Sede principal ou o super-admin.
 */
export async function assertAffiliationManage(): Promise<AuthzResult> {
  const ctx = await assertPermission(PERMISSIONS.AFFILIATION_MANAGE)

  if (isSuperAdminEmail(ctx.session.user.email)) {
    return ctx
  }

  if (!(await tenantIsAdministracaoSede(ctx.tenant.id))) {
    throw new Error('Somente a administração da sede pode validar solicitações de afiliação.')
  }

  return ctx
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

  if (!(await tenantIsAdministracaoSede(tenant.id))) throw new Error('Sem permissão')

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
    return { session, tenant, permissoesEfetivas: effective }
  }

  if (visibilidade !== 'PUBLICO') {
    throw new Error(
      'Enquanto seu vínculo não for aprovado, publique apenas posts públicos no feed de torcedor.',
    )
  }

  if (await podePublicarComoTorcedorFeed(session.user.id, tenant.id)) {
    return { session, tenant, permissoesEfetivas: effective }
  }

  if (membro?.status === 'PENDENTE') {
    throw new Error('Seu vínculo ainda está em análise.')
  }
  if (membro && membro.status !== 'APROVADO') {
    throw new Error('Seu cadastro de associado não está ativo.')
  }
  // Membro APROVADO sem `community:post`: `podePublicarComoTorcedorFeed`
  // devolve false para quem é aprovado, então a recusa acima é a permissão —
  // não o onboarding. Sem este ramo a mensagem caía no fall-through e mandava
  // concluir um onboarding já concluído, divergindo de
  // `checarPodePublicarNoFeed` (que alimenta o compositor). Ver
  // `docs/ops/auditoria-funcional-2026-07.md` §Achado 7.
  if (membro && !temPermissao) {
    throw new Error('Você não tem permissão para publicar.')
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

/**
 * Resolve a afiliação (clube) do usuário para fins de Comunidade Nacional:
 * torcedor global com onboarding concluído, ou sócio com vínculo `APROVADO`
 * cujo tenant ativo pertence a um clube. `null` quando o usuário não tem
 * nenhum clube vinculado.
 */
export async function resolveAfiliacaoComunidadeDoUsuario(
  userId: string,
  email?: string | null,
): Promise<string | null> {
  const perfil: { onboardingConcluidoEm: Date | null; afiliacaoId: string | null } | null =
    await db.perfilTorcedor.findUnique({
      where: { userId },
      select: { onboardingConcluidoEm: true, afiliacaoId: true },
    })
  if (perfil?.onboardingConcluidoEm && perfil.afiliacaoId) return perfil.afiliacaoId

  const tenant = await getActiveTenant(userId, email)
  if (!tenant?.afiliacaoId) return null

  const membro: { status: string } | null = await db.saasMembro.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId } },
    select: { status: true },
  })
  if (membro?.status === 'APROVADO') return tenant.afiliacaoId

  return null
}

/**
 * Sessão + afiliação + tenant sintético (container operacional) da
 * Comunidade Nacional do clube do usuário. Único critério de acesso: ter um
 * clube resolvível via `resolveAfiliacaoComunidadeDoUsuario` — a CN não tem
 * `SaasMembro`/cargos próprios.
 */
export async function assertComunidadeNacional(): Promise<AuthzComunidadeNacional> {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Não autorizado')

  let afiliacaoId = await resolveAfiliacaoComunidadeDoUsuario(session.user.id, session.user.email)

  if (!afiliacaoId && isSuperAdminEmail(session.user.email)) {
    const tenant = await resolvePortalTenant(session)
    afiliacaoId = tenant?.afiliacaoId ?? null
  }

  if (!afiliacaoId) {
    throw new Error('Você precisa de um clube vinculado para acessar a Comunidade Nacional.')
  }

  const tenantSintetico = await getOrCreateComunidadeNacionalTenant(afiliacaoId)
  return { session, afiliacaoId, tenantSintetico }
}

/**
 * Pode entrar numa sala visível na Comunidade Nacional: qualquer sala do
 * tenant sintético (container da CN) ou sala `ABERTA` de uma unidade real do
 * mesmo clube. `EVENTO`/`DM_GRUPO` fora do sintético permanecem restritas ao
 * tenant de origem — nunca acessíveis pelo caminho nacional.
 */
export async function assertPodeAcessarSalaNacional(salaId: string): Promise<{
  session: Session
  sala: { id: string; tenantId: string; hostId: string; tipo: string; livekitRoomName: string }
  isHost: boolean
  tenantSinteticoId: string
  afiliacaoId: string
}> {
  const sala: { id: string; tenantId: string; hostId: string; tipo: string; livekitRoomName: string } | null =
    await db.salaReuniao.findFirst({
      where: { id: salaId, encerradaEm: null },
      select: { id: true, tenantId: true, hostId: true, tipo: true, livekitRoomName: true },
    })
  if (!sala) throw new Error('Sala indisponível.')

  const tenantDaSala: { afiliacaoId: string | null; sintetico: boolean } | null =
    await db.tenant.findUnique({
      where: { id: sala.tenantId },
      select: { afiliacaoId: true, sintetico: true },
    })
  if (!tenantDaSala?.afiliacaoId) throw new Error('Sala indisponível.')

  const { session, afiliacaoId, tenantSintetico } = await assertComunidadeNacional()
  if (afiliacaoId !== tenantDaSala.afiliacaoId) throw new Error('Sala indisponível.')

  const podeAcessar = tenantDaSala.sintetico || sala.tipo === 'ABERTA'
  if (!podeAcessar) throw new Error('Sala indisponível.')

  return {
    session,
    sala,
    isHost: sala.hostId === session.user.id,
    tenantSinteticoId: tenantSintetico.id,
    afiliacaoId,
  }
}
