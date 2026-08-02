import type { Session } from 'next-auth'
import { auth } from '@/lib/auth'
import { assertComunidadeNacional, assertMembroAtivo } from '@/lib/authz'
import { db } from '@torcida/db'
import { getUserPermissionsInTenant } from '@/lib/tenant'
import { resolveTenantMinhaTorcida, resolverContextoComunidade } from '@/lib/comunidade-contexto'
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
  const session = await auth()
  if (!session?.user?.id) throw new Error('Não autenticado.')
  // Vínculo do usuário — nunca TENANT_SLUG (rivais no single-tenant).
  const tenant = await resolveTenantMinhaTorcida(session.user.id, session.user.email)
  if (!tenant) throw new Error('Não autenticado.')

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
 * Participante ativo da conversa. Leitura/escrita na thread é por
 * `MembroConversa` (não por tenant) — torcedor na CN e sócio usam o mesmo
 * gate depois de já estarem na conversa.
 */
export async function assertConversaAccess(conversaId: string) {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Não autenticado.')

  const membro = await assertMembroConversa(conversaId, session.user.id)
  const tenant = { id: membro.conversa.tenantId }
  return {
    session,
    tenant,
    userId: session.user.id,
    membro,
    conversa: membro.conversa,
  }
}

/**
 * Elegível para mensageria no caminho da Comunidade Nacional (torcedor global
 * ou sócio via o clube). Não checa `SaasMembro`/cargo — a CN não tem um; a
 * listagem do inbox (`listConversas`) já é chaveada por participação.
 */
export async function assertUsuarioMensageriaNacional(): Promise<{
  session: Session
  tenantSintetico: { id: string }
  afiliacaoId: string
  userId: string
}> {
  const { session, tenantSintetico, afiliacaoId } = await assertComunidadeNacional()
  return { session, tenantSintetico, afiliacaoId, userId: session.user.id }
}

/**
 * Igual a `assertUsuarioMensageriaNacional` — elegibilidade de envio na CN
 * não depende de permissão de cargo (não há `UserRole` no tenant sintético);
 * o gate por destinatário é `mesmaAfiliacaoComunidade` (ver `mensageria.ts`).
 */
export async function assertPodeEnviarMensagensNacional(): Promise<{
  session: Session
  tenantSintetico: { id: string }
  afiliacaoId: string
  userId: string
}> {
  return assertUsuarioMensageriaNacional()
}

export type ContextoMensageria =
  | { via: 'torcida'; session: Session; tenant: { id: string } }
  | { via: 'nacional'; session: Session; tenant: { id: string } }

/**
 * Tenant de regras para `avaliarAcessoDm`: id da torcida se o usuário pode
 * usar mensageria ali; `null` na Comunidade Nacional (ou cookie/host sem vínculo).
 */
export async function resolveTenantContextoDm(
  userId: string,
  email?: string | null,
): Promise<string | null> {
  const ctx = await resolverContextoComunidade(userId, email)
  if (ctx?.modo === 'torcida') {
    const status = await getStatusInboxMensageria(userId, ctx.tenant.id)
    if (status.podeListar) return ctx.tenant.id
  }
  return null
}

/**
 * Split preferido para rotas de mensageria dual: resolve o tenant real
 * (torcida ativa) ou, na ausência dele, o tenant sintético da Comunidade
 * Nacional do clube do usuário — sempre devolve um `tenant.id` utilizável
 * como contexto/auditoria (`Conversa.tenantId`).
 */
export async function assertContextoMensageria(): Promise<ContextoMensageria> {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Não autenticado.')

  const ctx = await resolverContextoComunidade(session.user.id, session.user.email)
  if (ctx?.modo === 'torcida') {
    // Cookie/host pode apontar uma torcida do clube sem o usuário ser sócio
    // elegível ali — nesse caso a mensageria cai na CN (senão POST 403 / busca vazia).
    const status = await getStatusInboxMensageria(session.user.id, ctx.tenant.id)
    if (status.podeListar) {
      return { via: 'torcida', session, tenant: { id: ctx.tenant.id } }
    }
    if (ctx.tenantSintetico) {
      return { via: 'nacional', session, tenant: { id: ctx.tenantSintetico.id } }
    }
  }
  if (ctx?.tenantSintetico) {
    return { via: 'nacional', session, tenant: { id: ctx.tenantSintetico.id } }
  }

  throw new Error('Você precisa de um clube vinculado para acessar as mensagens.')
}

/**
 * Tenta o caminho torcida (membro ativo no tenant do host) e cai para o
 * caminho nacional quando o usuário não tem vínculo ali mas tem clube
 * (torcedor global ou sócio noutra unidade).
 */
export async function assertUsuarioMensageriaFlexivel(): Promise<
  | ({ via: 'torcida' } & Awaited<ReturnType<typeof assertUsuarioMensageria>>)
  | ({ via: 'nacional' } & Awaited<ReturnType<typeof assertUsuarioMensageriaNacional>>)
> {
  try {
    const ctx = await assertUsuarioMensageria()
    return { ...ctx, via: 'torcida' as const }
  } catch {
    const ctx = await assertUsuarioMensageriaNacional()
    return { ...ctx, via: 'nacional' as const }
  }
}
