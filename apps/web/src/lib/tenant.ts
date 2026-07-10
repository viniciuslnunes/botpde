import { cache } from 'react'
import { unstable_cache, revalidateTag } from 'next/cache'
import { headers } from 'next/headers'
import { db } from '@torcida/db'
import type { Tenant } from '@torcida/db'
import { env } from '@/lib/env'

export const TENANT_CACHE_TAG = 'tenant-by-slug'

export function tenantCacheTag(slug: string): string {
  return `tenant-slug-${slug}`
}

export function permissionsCacheTag(userId: string, tenantId: string): string {
  return `permissions-${userId}-${tenantId}`
}

/** Invalida cache de tenant após mudanças de perfil/configuração. */
export function invalidateTenantCache(slug?: string): void {
  revalidateTag(TENANT_CACHE_TAG, 'max')
  if (slug) revalidateTag(tenantCacheTag(slug), 'max')
}

/** Invalida cache de permissões após mudanças de acesso. */
export function invalidatePermissionsCache(userId: string, tenantId: string): void {
  revalidateTag(permissionsCacheTag(userId, tenantId), 'max')
}

async function fetchTenantBySlug(slug: string): Promise<Tenant | null> {
  return unstable_cache(
    () =>
      db.tenant.findUnique({
        where: { slug, ativo: true },
      }),
    ['tenant-by-slug', slug],
    { revalidate: 600, tags: [TENANT_CACHE_TAG, tenantCacheTag(slug)] },
  )()
}

/**
 * Resolve o tenant a partir do hostname da requisição.
 * Ex: pde-gavioes.torcida.app → slug "pde-gavioes"
 * Em desenvolvimento: usa variável TENANT_SLUG como fallback.
 */
export const getTenantFromHost = cache(async function getTenantFromHost(): Promise<Tenant | null> {
  const headersList = await headers()
  const host = headersList.get('host') ?? ''

  const slug = extractSlugFromHost(host)
  if (!slug) return null

  return fetchTenantBySlug(slug)
})

function extractSlugFromHost(host: string): string | null {
  const hostname = host.split(':')[0]

  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return env.TENANT_SLUG ?? null
  }

  const rootDomain = env.ROOT_DOMAIN
  const parts = hostname.split('.')

  if (rootDomain && hostname.endsWith(`.${rootDomain}`)) {
    return parts[0]
  }

  return env.TENANT_SLUG ?? null
}

async function fetchUserPermissionsImpl(userId: string, tenantId: string) {
  const [userRoles, userPermissions] = await Promise.all([
    db.userRole.findMany({
      where: { userId, tenantId },
      include: { role: true },
    }),
    db.userPermission.findMany({
      where: { userId, tenantId },
    }),
  ])

  const rolePermissions = userRoles.flatMap(
    (ur: { role: { permissions: string[] } }) => ur.role.permissions,
  )

  return {
    rolePermissions,
    overrides: userPermissions.map((up: { permission: string; granted: boolean }) => ({
      permission: up.permission,
      granted: up.granted,
    })),
    systemRole:
      userRoles.find((ur: { role: { isSystem: boolean; nome: string } }) => ur.role.isSystem)
        ?.role.nome ?? null,
  }
}

/**
 * Retorna as permissões efetivas de um usuário em um tenant.
 * Usado nos layouts de /admin para verificar acesso.
 */
export const getUserPermissionsInTenant = cache(async function getUserPermissionsInTenant(
  userId: string,
  tenantId: string,
) {
  return unstable_cache(
    () => fetchUserPermissionsImpl(userId, tenantId),
    ['user-permissions', userId, tenantId],
    { revalidate: 300, tags: [permissionsCacheTag(userId, tenantId)] },
  )()
})
