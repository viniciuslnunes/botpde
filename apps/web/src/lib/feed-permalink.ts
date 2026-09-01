import { cache } from 'react'
import { db } from '@torcida/db'
import {
  PERMISSIONS,
  calculateEffectivePermissions,
  hasPermission,
} from '@torcida/types'
import { getUserPermissionsInTenant } from '@/lib/tenant'
import { isSuperAdminEmail } from '@/lib/tenant-context'

/**
 * Leitura de moderação no permalink: o post denunciado precisa abrir para
 * quem está na fila (`community:moderate` / `community:view` no tenant do
 * post, ou super-admin), mesmo quando o autor é sócio com perfil privado
 * (default na aprovação) e o revisor não o segue — senão "Ver post" na
 * moderação vira 404.
 *
 * Não substitui o alcance de tenant do membro: rival continua barrado.
 */
export const podeLerPermalinkComoModerador = cache(
  async function podeLerPermalinkComoModerador(
    viewerId: string,
    postTenantId: string,
  ): Promise<boolean> {
    const user: { email: string | null } | null = await db.user.findUnique({
      where: { id: viewerId },
      select: { email: true },
    })
    if (isSuperAdminEmail(user?.email)) return true

    const { rolePermissions, overrides } = await getUserPermissionsInTenant(
      viewerId,
      postTenantId,
    )
    const efetivas = calculateEffectivePermissions(rolePermissions, overrides)
    return (
      hasPermission(efetivas, PERMISSIONS.COMMUNITY_MODERATE) ||
      hasPermission(efetivas, PERMISSIONS.COMMUNITY_VIEW)
    )
  },
)
