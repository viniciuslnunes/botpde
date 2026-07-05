import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { getTenantFromHost, getUserPermissionsInTenant } from '@/lib/tenant'
import { calculateEffectivePermissions, hasPermission } from '@torcida/types'

/** Sessão + tenant resolvidos, com o usuário logado tendo cargo owner ou admin no tenant atual. */
export async function assertAdmin() {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])

  if (!session?.user?.id || !tenant) {
    throw new Error('Não autorizado')
  }

  const userRole = await db.userRole.findFirst({
    where: {
      userId: session.user.id,
      tenantId: tenant.id,
      role: { isSystem: true, nome: { in: ['owner', 'admin'] } },
    },
  })

  if (!userRole) throw new Error('Sem permissão')

  return { session, tenant }
}

/** Sessão + tenant resolvidos, com o usuário logado tendo cargo owner no tenant atual. */
export async function assertOwner() {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])

  if (!session?.user?.id || !tenant) throw new Error('Não autorizado')

  const ownerRole = await db.userRole.findFirst({
    where: {
      userId: session.user.id,
      tenantId: tenant.id,
      role: { isSystem: true, nome: 'owner' },
    },
  })

  if (!ownerRole) throw new Error('Apenas o owner pode alterar configurações')

  return { session, tenant }
}

type AuthzResult = Awaited<ReturnType<typeof assertAdmin>>

/**
 * Sessão + tenant resolvidos, com o usuário logado tendo a permissão efetiva
 * indicada (perfil ou permissão adicional) no tenant atual. Ao contrário de
 * `assertAdmin`, não exige cargo de sistema — funciona com perfis customizados.
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
