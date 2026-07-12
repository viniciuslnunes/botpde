import { cache } from 'react'
import { unstable_cache, revalidateTag } from 'next/cache'
import { headers } from 'next/headers'
import { cookies } from 'next/headers'
import { db } from '@torcida/db'
import type { Tenant } from '@torcida/db'
import { env } from '@/lib/env'
import { TENANT_CTX_COOKIE } from '@/lib/tenant-context'

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
 * Resolve o tenant ativo da requisição.
 * Ordem: subdomínio (ROOT_DOMAIN) → cookie torcida_ctx → TENANT_SLUG.
 */
export const getTenantFromHost = cache(async function getTenantFromHost(): Promise<Tenant | null> {
  const headersList = await headers()
  const host = headersList.get('host') ?? ''

  const slugFromHost = extractSlugFromSubdomain(host)
  if (slugFromHost) return fetchTenantBySlug(slugFromHost)

  const cookieStore = await cookies()
  const slugFromCookie = cookieStore.get(TENANT_CTX_COOKIE)?.value?.trim()
  if (slugFromCookie) return fetchTenantBySlug(slugFromCookie)

  const fallback = fallbackTenantSlug(host)
  if (fallback) return fetchTenantBySlug(fallback)

  return null
})

/** Slug vindo só de subdomínio real — não inclui TENANT_SLUG nem cookie. */
function extractSlugFromSubdomain(host: string): string | null {
  const hostname = host.split(':')[0]
  const rootDomain = env.ROOT_DOMAIN
  if (!rootDomain) return null

  if (hostname === rootDomain || hostname === `www.${rootDomain}`) return null

  if (hostname.endsWith(`.${rootDomain}`)) {
    return hostname.slice(0, -(rootDomain.length + 1)).split('.')[0] || null
  }

  return null
}

function fallbackTenantSlug(host: string): string | null {
  const hostname = host.split(':')[0]
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return env.TENANT_SLUG ?? null
  }
  if (!env.ROOT_DOMAIN) {
    return env.TENANT_SLUG ?? null
  }
  return null
}

/**
 * URL base do portal de uma torcida (subdomínio quando ROOT_DOMAIN existe).
 * Retorna path relativo quando a torcida é a do deploy atual (TENANT_SLUG).
 */
export function buildPortalUrl(tenantSlug: string, path = '/portal/comunidade'): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  if (env.ROOT_DOMAIN) {
    const protocol = env.NODE_ENV === 'production' ? 'https' : 'http'
    return `${protocol}://${tenantSlug}.${env.ROOT_DOMAIN}${normalized}`
  }
  if (env.TENANT_SLUG && tenantSlug === env.TENANT_SLUG) {
    return normalized
  }
  // Single-tenant com cookie: mesmo host, contexto via torcida_ctx.
  if (!env.ROOT_DOMAIN) {
    return normalized
  }
  return `/onboarding/solicitado?torcida=${encodeURIComponent(tenantSlug)}`
}

/** Torcida disponível neste host (subdomínio, cookie ou TENANT_SLUG). */
export function torcidaAcessivelNoHost(_tenantSlug: string): boolean {
  if (env.ROOT_DOMAIN) return true
  // Single-tenant: cookie torcida_ctx permite qualquer torcida provisionada.
  return true
}

/** Torcida ativa: host → cookie → vínculo do usuário (mesma requisição). */
export async function getActiveTenant(
  userId?: string,
  email?: string | null,
): Promise<Tenant | null> {
  const fromHost = await getTenantFromHost()
  if (fromHost) return fromHost

  if (userId) {
    const { resolveHomeTenantSlugForUser, isSuperAdminEmail } = await import('@/lib/tenant-context')
    if (!isSuperAdminEmail(email)) {
      const slug = await resolveHomeTenantSlugForUser(userId)
      if (slug) return fetchTenantBySlug(slug)
    }
  }

  return null
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
