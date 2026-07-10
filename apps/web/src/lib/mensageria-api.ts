import { auth } from '@/lib/auth'
import { assertMembroAtivo } from '@/lib/authz'
import { getTenantFromHost, getUserPermissionsInTenant } from '@/lib/tenant'
import { PERMISSIONS, calculateEffectivePermissions, hasPermission } from '@torcida/types'
import { assertMembroConversa } from './mensageria'

/** Sessão + tenant + membro ativo — base de toda rota de mensageria. */
export async function assertUsuarioMensageria() {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id || !tenant) throw new Error('Não autenticado.')
  await assertMembroAtivo(tenant.id, session.user.id)
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
