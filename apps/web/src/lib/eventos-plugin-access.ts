import { db } from '@torcida/db'
import {
  calculateEffectivePermissions,
  hasPermission,
  PERMISSIONS,
} from '@torcida/types'

/**
 * Acesso ao plugin Caravanas/Bateria:
 * - ver: membro do departamento OU events:create|manage
 * - criar: events:create|manage
 * - check-in / gerir lista: events:manage
 */
export async function resolveAcessoPluginEvento(
  userId: string,
  tenantId: string,
  deptoSlug: 'caravanas' | 'bateria',
  rolePermissions: string[],
  overrides: { permission: string; granted: boolean }[],
  isSuperAdmin: boolean,
): Promise<{ podeVer: boolean; podeCriar: boolean; podeGerir: boolean }> {
  if (isSuperAdmin) return { podeVer: true, podeCriar: true, podeGerir: true }

  const effective = calculateEffectivePermissions(rolePermissions, overrides)
  const podeGerir = hasPermission(effective, PERMISSIONS.EVENTS_MANAGE)
  const podeCriar =
    podeGerir || hasPermission(effective, PERMISSIONS.EVENTS_CREATE)

  if (podeCriar || podeGerir) {
    return { podeVer: true, podeCriar, podeGerir }
  }

  const membership: { id: string } | null = await db.userDepartamento.findFirst({
    where: {
      userId,
      tenantId,
      departamento: { slug: deptoSlug, tenantId },
    },
    select: { id: true },
  })

  return { podeVer: Boolean(membership), podeCriar: false, podeGerir: false }
}
