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
