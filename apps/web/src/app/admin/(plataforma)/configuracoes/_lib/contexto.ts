import { cache } from 'react'
import { db } from '@torcida/db'
import { hasPermission, PERMISSIONS } from '@torcida/types'
import { assertAnyPermission } from '@/lib/authz'
import { getEstadoSuportePlataforma } from '@/lib/suporte-plataforma'

export interface ConfigContexto {
  userId: string
  tenant: Awaited<ReturnType<typeof assertAnyPermission>>['tenant']
  /** Owner do tenant — cargo de sistema `owner`, sem atalho de super-admin. */
  isOwner: boolean
  /** Super-admin da plataforma (fora do RBAC por tenant). */
  isSuperAdmin: boolean
  /**
   * Pode gravar as seções "Somente owner": o owner, ou o super-admin quando a
   * unidade autoriza o suporte (ou ainda não tem liderança). Espelha
   * `assertOwnerOuSuportePlataforma` — a UI esconde exatamente o que a Server
   * Action recusaria.
   */
  podeEditarConfigDeOwner: boolean
  /** Esta unidade já tem alguém com o cargo `owner`. */
  temLideranca: boolean
  /** Consentimento de suporte gravado nesta unidade. */
  suporteConsentido: boolean
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

  const isSuperAdmin = Boolean(authz.isSuperAdmin)
  const isOwner = owner !== null
  const suporte = await getEstadoSuportePlataforma(authz.tenant.id)

  const efetivas = authz.permissoesEfetivas ?? []
  const canManageSettings = isSuperAdmin || hasPermission(efetivas, PERMISSIONS.SETTINGS_MANAGE)
  const canManagePendenciasCadastro =
    isSuperAdmin ||
    hasPermission(efetivas, PERMISSIONS.ASSOCIACAO_PENDENCIAS_MANAGE) ||
    canManageSettings

  return {
    userId: authz.session.user.id,
    tenant: authz.tenant,
    isOwner,
    isSuperAdmin,
    podeEditarConfigDeOwner:
      canManageSettings && (isOwner || (isSuperAdmin && suporte.superAdminPodeOperar)),
    temLideranca: suporte.temLideranca,
    suporteConsentido: suporte.consentido,
    canManageSettings,
    canManagePendenciasCadastro,
  }
})
