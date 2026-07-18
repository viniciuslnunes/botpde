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

/**
 * Leitura da thread: só sessão + participação (`MembroConversa`).
 * Não depende do tenant do host — alinhado à regra da mensageria (DM entre
 * torcidas aliadas) e evita 400 quando a inbox SSR já listou a conversa.
 */
export async function assertConversaLeitura(conversaId: string) {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Não autenticado.')
  const membro = await assertMembroConversa(conversaId, session.user.id)
  return { session, userId: session.user.id, membro, conversa: membro.conversa }
}

/** Mutação na conversa: elegível no tenant do host + participante ativo. */
export async function assertConversaAccess(conversaId: string) {
  const ctx = await assertUsuarioMensageria()
  const membro = await assertMembroConversa(conversaId, ctx.userId)
  return { ...ctx, membro, conversa: membro.conversa }
}

/** Mapeia erros conhecidos da mensageria para status HTTP (evita 400 genérico). */
export function statusErroMensageria(error: unknown): { message: string; status: number } {
  const message = error instanceof Error ? error.message : 'Erro inesperado.'
  if (message.includes('autentic')) return { message, status: 401 }
  if (message === 'Conversa não encontrada') return { message, status: 404 }
  if (
    message.includes('aprovado') ||
    message.includes('associado') ||
    message.includes('carteirinha') ||
    message.includes('permissão') ||
    message.includes('não está ativo')
  ) {
    return { message, status: 403 }
  }
  return { message, status: 500 }
}
