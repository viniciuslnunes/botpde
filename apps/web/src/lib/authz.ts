import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import type { Tenant } from '@torcida/db'
import type { Session } from 'next-auth'
import { getTenantFromHost, getUserPermissionsInTenant } from '@/lib/tenant'
import { calculateEffectivePermissions, hasPermission, PERMISSIONS } from '@torcida/types'

type AuthzResult = {
  session: Session
  tenant: Tenant
}

/**
 * Sessão + tenant resolvidos, com o usuário logado tendo a permissão efetiva
 * indicada (perfil ou permissão adicional) no tenant atual. Único critério de
 * autorização do admin — não exige cargo de sistema, funciona com perfis
 * customizados (ver ARCHITECTURE.md item 16).
 */
export async function assertPermission(permission: string): Promise<AuthzResult> {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])

  if (!session?.user?.id || !tenant) throw new Error('Não autorizado')

  const { rolePermissions, overrides }: { rolePermissions: string[]; overrides: { permission: string; granted: boolean }[] } =
    await getUserPermissionsInTenant(session.user.id, tenant.id)
  const effective: string[] = calculateEffectivePermissions(rolePermissions, overrides)

  if (!hasPermission(effective, permission)) throw new Error('Sem permissão')

  return { session, tenant }
}

/** Leitura da loja (pedidos): STORE_VIEW_ORDERS ou STORE_MANAGE. */
export async function assertStoreView(): Promise<AuthzResult> {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id || !tenant) throw new Error('Não autorizado')

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
 * Checagem read-only para UI — retorna mensagem de bloqueio ou `null` se pode publicar.
 */
export async function checarPodePublicarNoFeed(
  userId: string,
  tenantId: string,
): Promise<string | null> {
  const hostTenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { nome: true },
  })
  const hostNome = hostTenant?.nome ?? 'esta torcida'

  const membroHost = await db.saasMembro.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
    select: { status: true },
  })

  if (!membroHost) {
    const membroOutro = await db.saasMembro.findFirst({
      where: { userId, NOT: { tenantId } },
      select: {
        status: true,
        tenant: { select: { nome: true } },
      },
      orderBy: { criadoEm: 'desc' },
    })
    if (membroOutro?.status === 'PENDENTE') {
      return `Sua solicitação na ${membroOutro.tenant.nome} está em análise. Este portal é da ${hostNome}.`
    }
    if (membroOutro?.status === 'APROVADO') {
      return `Você é membro da ${membroOutro.tenant.nome}. Este portal é da ${hostNome} — acesse o portal da sua torcida.`
    }
    if (membroOutro) {
      return `Seu vínculo com ${membroOutro.tenant.nome} não está ativo. Este portal é da ${hostNome}.`
    }
    return 'Associe-se à torcida para publicar no feed.'
  }

  const { rolePermissions, overrides } = await getUserPermissionsInTenant(userId, tenantId)
  const effective = calculateEffectivePermissions(rolePermissions, overrides)

  if (!hasPermission(effective, PERMISSIONS.COMMUNITY_POST)) {
    if (membroHost.status === 'PENDENTE') {
      return 'Seu vínculo ainda está em análise. Publicar libera quando a torcida aprovar seu cadastro.'
    }
    if (membroHost.status !== 'APROVADO') {
      return 'Seu cadastro de associado não está ativo.'
    }
    return 'Você não tem permissão para publicar.'
  }

  try {
    await assertMembroAtivo(tenantId, userId)
    return null
  } catch (error) {
    return error instanceof Error ? error.message : 'Não é possível publicar.'
  }
}
