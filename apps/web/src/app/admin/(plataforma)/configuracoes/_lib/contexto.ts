import { cache } from 'react'
import { db } from '@torcida/db'
import { hasPermission, PERMISSIONS } from '@torcida/types'
import { assertAnyPermission } from '@/lib/authz'

export interface ConfigContexto {
  userId: string
  tenant: Awaited<ReturnType<typeof assertAnyPermission>>['tenant']
  /** Owner do tenant — várias seções são restritas a ele, além do RBAC. */
  isOwner: boolean
  /** Pode editar seções gerais de configuração (settings:manage). */
  canManageSettings: boolean
  /** Pode ligar/desligar solicitação de dados pendentes nesta unidade. */
  canManagePendenciasCadastro: boolean
}

/**
 * Sessão + tenant autorizado + flags das rotas de configuração.
 * Aceita `settings:manage` **ou** `associacao:pendencias_manage` (admin/vice/
 * liderança/owner) para a aba Geral.
 */
export const getConfigContexto = cache(async function getConfigContexto(): Promise<ConfigContexto> {
  const authz = await assertAnyPermission([
    PERMISSIONS.SETTINGS_MANAGE,
    PERMISSIONS.ASSOCIACAO_PENDENCIAS_MANAGE,
  ])

  const owner: { id: string } | null = await db.userRole.findFirst({
    where: {
      userId: authz.session.user.id,
      tenantId: authz.tenant.id,
      role: { isSystem: true, nome: 'owner' },
    },
    select: { id: true },
  })

  const efetivas = authz.permissoesEfetivas ?? []
  const canManageSettings =
    Boolean(authz.isSuperAdmin) || hasPermission(efetivas, PERMISSIONS.SETTINGS_MANAGE)
  const canManagePendenciasCadastro =
    Boolean(authz.isSuperAdmin) ||
    hasPermission(efetivas, PERMISSIONS.ASSOCIACAO_PENDENCIAS_MANAGE) ||
    canManageSettings

  return {
    userId: authz.session.user.id,
    tenant: authz.tenant,
    isOwner: Boolean(owner) || Boolean(authz.isSuperAdmin),
    canManageSettings,
    canManagePendenciasCadastro,
  }
})
