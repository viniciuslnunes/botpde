import { auth } from '@/lib/auth'
import { assertMembroAtivo } from '@/lib/authz'
import { db } from '@torcida/db'
import { getTenantFromHost, getUserPermissionsInTenant } from '@/lib/tenant'
import { PERMISSIONS, calculateEffectivePermissions, hasPermission } from '@torcida/types'
import { assertMembroConversa } from './mensageria'

export type MotivoInboxBloqueado = 'cadastro_pendente' | 'sem_vinculo' | 'cadastro_reprovado'

export type StatusInboxMensageria =
  | { podeListar: true; via: 'membro' | 'cargo' }
  | { podeListar: false; motivo: MotivoInboxBloqueado }

/**
 * Quem pode ver a inbox: membro APROVADO ou quem tem cargo no tenant
 * (owner/admin legado sem linha em SaasMembro). Torcedor global e
 * PENDENTE recebem lista vazia com flag — nunca 403 no GET.
 */
export async function getStatusInboxMensageria(
  userId: string,
  tenantId: string,
): Promise<StatusInboxMensageria> {
  const [membro, cargo] = await Promise.all([
    db.saasMembro.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { status: true },
    }),
    db.userRole.findFirst({
      where: { userId, tenantId },
      select: { id: true },
    }),
  ])

  if (cargo) return { podeListar: true, via: 'cargo' }
  if (!membro) return { podeListar: false, motivo: 'sem_vinculo' }
  if (membro.status === 'PENDENTE') return { podeListar: false, motivo: 'cadastro_pendente' }
  if (membro.status === 'APROVADO') return { podeListar: true, via: 'membro' }
  return { podeListar: false, motivo: 'cadastro_reprovado' }
}

/** Sessão + tenant + elegível para mensageria (membro ativo ou cargo no tenant). */
export async function assertUsuarioMensageria() {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id || !tenant) throw new Error('Não autenticado.')

  const status = await getStatusInboxMensageria(session.user.id, tenant.id)
  if (!status.podeListar) {
    if (status.motivo === 'cadastro_pendente') {
      throw new Error('Seu cadastro de associado ainda não foi aprovado.')
    }
    if (status.motivo === 'cadastro_reprovado') {
      throw new Error('Seu cadastro de associado não está ativo.')
    }
    throw new Error('Você precisa ser associado desta torcida para essa ação.')
  }

  if (status.via === 'membro') {
    await assertMembroAtivo(tenant.id, session.user.id)
  }

  return { session, tenant, userId: session.user.id }
}

/** Igual ao acima + exige a permissão `messages:send` (cargo member tem). */
export async function assertPodeEnviarMensagens() {
  const ctx = await assertUsuarioMensageria()
  const { rolePermissions, overrides } = await getUserPermissionsInTenant(
    ctx.userId,
    ctx.tenant.id,
  )
  const efetivas: string[] = calculateEffectivePermissions(rolePermissions, overrides)
  if (!hasPermission(efetivas, PERMISSIONS.MESSAGES_SEND)) {
    throw new Error('Você não tem permissão para enviar mensagens.')
  }
  return { ...ctx, efetivas }
}

/** Usuário autenticado + participante ativo da conversa. */
export async function assertConversaAccess(conversaId: string) {
  const ctx = await assertUsuarioMensageria()
  const membro = await assertMembroConversa(conversaId, ctx.userId)
  return { ...ctx, membro, conversa: membro.conversa }
}
