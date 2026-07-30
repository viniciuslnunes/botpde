import { cache } from 'react'
import { db } from '@torcida/db'
import { PERMISSIONS } from '@torcida/types'
import { assertPermission } from '@/lib/authz'

export interface ConfigContexto {
  userId: string
  tenant: Awaited<ReturnType<typeof assertPermission>>['tenant']
  /** Owner do tenant — várias seções são restritas a ele, além do RBAC. */
  isOwner: boolean
}

/**
 * Sessão + tenant autorizado + flag de owner das rotas de configuração.
 * `cache()` porque
 * as três etapas (geral/transparência/integrações) resolvem o mesmo contexto,
 * e o layout do módulo já resolveu tenant e permissões no mesmo request.
 */
export const getConfigContexto = cache(async function getConfigContexto(): Promise<ConfigContexto> {
  const { session, tenant } = await assertPermission(PERMISSIONS.SETTINGS_MANAGE)

  const owner: { id: string } | null = await db.userRole.findFirst({
    where: {
      userId: session.user.id,
      tenantId: tenant.id,
      role: { isSystem: true, nome: 'owner' },
    },
    select: { id: true },
  })

  return { userId: session.user.id, tenant, isOwner: Boolean(owner) }
})
