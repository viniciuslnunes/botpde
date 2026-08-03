import { cache } from 'react'
import { unstable_cache, revalidateTag } from 'next/cache'
import { headers } from 'next/headers'
import { cookies } from 'next/headers'
import { db } from '@torcida/db'
import type { Tenant } from '@torcida/db'
import { formatNomeTorcida, permissionsOfRole } from '@torcida/types'
import { env } from '@/lib/env'
import { resolveRequestHost } from '@/lib/request-origin'
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
  const tenant = await unstable_cache(
    () =>
      db.tenant.findUnique({
        where: { slug, ativo: true },
      }),
    ['tenant-by-slug', slug],
    { revalidate: 600, tags: [TENANT_CACHE_TAG, tenantCacheTag(slug)] },
  )()
  if (!tenant) return null
  return { ...tenant, nome: formatNomeTorcida(tenant.nome) }
}

/**
 * Resolve o tenant ativo da requisição.
 * Ordem: subdomínio (ROOT_DOMAIN) → cookie torcida_ctx → TENANT_SLUG.
 */
async function readRequestHost(): Promise<string> {
  const headersList = await headers()
  const host = headersList.get('host') ?? ''
  const forwarded = headersList.get('x-forwarded-host')?.split(',')[0]?.trim() ?? ''
  // Prefere o header que carrega o subdomínio da torcida — atrás de proxy o
  // x-forwarded-host às vezes é o host interno e apaga o slug (pde-…).
  if (extractSlugFromSubdomain(host)) return host
  if (forwarded && extractSlugFromSubdomain(forwarded)) return forwarded
  return resolveRequestHost(forwarded, host)
}

export const getTenantFromHost = cache(async function getTenantFromHost(): Promise<Tenant | null> {
  const host = await readRequestHost()

  const slugFromHost = extractSlugFromSubdomain(host)
  if (slugFromHost) return fetchTenantBySlug(slugFromHost)

  const cookieStore = await cookies()
  const slugFromCookie = cookieStore.get(TENANT_CTX_COOKIE)?.value?.trim()
  if (slugFromCookie) {
    const fromCookie = await fetchTenantBySlug(slugFromCookie)
    // Cookie inválido/antigo não pode engolir o TENANT_SLUG do deploy.
    if (fromCookie) return fromCookie
  }

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
 * Logo efetivo do tenant para topbar / comunidade:
 * 1. `Sede.fotoUrl` da sede raiz (foto da unidade)
 * 2. `Tenant.logoUrl` (Design)
 * 3. avatar do canal oficial
 */
export async function resolveTenantLogoUrl(
  tenantId: string,
  tenantLogoUrl: string | null,
): Promise<string | null> {
  const sedesDoTenant: Array<{ id: string; sedeId: string | null; fotoUrl: string | null }> =
    await db.sede.findMany({
      where: { tenantId },
      select: { id: true, sedeId: true, fotoUrl: true },
    })
  const idsDoTenant = new Set(sedesDoTenant.map((s) => s.id))
  const raiz = sedesDoTenant.find((s) => !s.sedeId || !idsDoTenant.has(s.sedeId))
  if (raiz?.fotoUrl) return raiz.fotoUrl

  if (tenantLogoUrl) return tenantLogoUrl

  const canalOficial: { avatarUrl: string | null } | null = await db.conversa.findFirst({
    where: { tenantId, tipo: 'CANAL', canalOficial: true },
    select: { avatarUrl: true },
  })
  return canalOficial?.avatarUrl ?? null
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

/**
 * Torcida ativa no portal logado (modo "Minha torcida" / sócio).
 * Ordem: subdomínio **com** vínculo SOCIO APROVADO → cookie com o mesmo
 * critério → slug do sócio APROVADO canônico → TENANT_SLUG (só super-admin /
 * sem user).
 *
 * TORCEDOR e SOCIO PENDENTE retornam `null`: ficam na Comunidade Nacional
 * do clube (`resolverContextoComunidade`), com aba da unidade do convite.
 * Subdomínio sem vínculo aprovado **não** abre loja/eventos/admin da Sede —
 * mesmo critério do cookie (antes o host vencia e vazava o portal de sócio).
 *
 * Não delega a getTenantFromHost() inteiro — em single-tenant o TENANT_SLUG do
 * deploy (ex.: Gaviões) não pode vencer o contexto correto de outro usuário.
 */
/** Deduplica layout + page (e portal) no mesmo request RSC. */
export const getActiveTenant = cache(async function getActiveTenant(
  userId?: string,
  email?: string | null,
): Promise<Tenant | null> {
  const {
    resolveUserTenantSlugForUser,
    vinculoAutorizaContextoTenant,
    isSuperAdminEmail,
  } = await import('@/lib/tenant-context')

  const host = await readRequestHost()
  const slugFromHost = extractSlugFromSubdomain(host)
  const superAdmin = Boolean(email && isSuperAdminEmail(email))

  if (slugFromHost) {
    // Host sem usuário (edge) ou super-admin: subdomínio manda.
    // Demais: só abre se SOCIO APROVADO naquele slug (igual ao cookie).
    if (!userId || superAdmin || (await vinculoAutorizaContextoTenant(userId, slugFromHost))) {
      const fromHost = await fetchTenantBySlug(slugFromHost)
      if (fromHost) return fromHost
    }
    // Subdomínio sem vínculo — não engolir o resto da resolução / CN.
  }

  if (userId && !superAdmin) {
    // Cookie só vence com vínculo SOCIO APROVADO naquela torcida.
    const cookieStore = await cookies()
    const slugFromCookie = cookieStore.get(TENANT_CTX_COOKIE)?.value?.trim()
    if (slugFromCookie && (await vinculoAutorizaContextoTenant(userId, slugFromCookie))) {
      const fromCookie = await fetchTenantBySlug(slugFromCookie)
      if (fromCookie) return fromCookie
    }

    const userSlug = await resolveUserTenantSlugForUser(userId)
    if (userSlug) return fetchTenantBySlug(userSlug)

    // Sem sócio: TORCEDOR / só PerfilTorcedor → CN (null). Não cair no
    // TENANT_SLUG do deploy nem reabrir tenant via cookie/subdomínio do clube.
    const perfil: { afiliacaoId: string | null } | null = await db.perfilTorcedor.findUnique({
      where: { userId },
      select: { afiliacaoId: true },
    })
    if (perfil?.afiliacaoId) return null
  }

  const cookieStore = await cookies()
  const slugFromCookie = cookieStore.get(TENANT_CTX_COOKIE)?.value?.trim()
  if (slugFromCookie) {
    const fromCookie = await fetchTenantBySlug(slugFromCookie)
    if (fromCookie) return fromCookie
  }

  const fallback = fallbackTenantSlug(host)
  if (fallback) return fetchTenantBySlug(fallback)

  return null
})

/**
 * Busca a base de permissões do usuário no tenant: permissões dos perfis (roles)
 * unidas às dos departamentos (membro e, se gestor, também permissionsGestor),
 * além dos overrides pontuais. A chave `rolePermissions` contém essa união.
 */
async function fetchUserPermissionsImpl(userId: string, tenantId: string) {
  const [userRoles, userPermissions, userDepartamentos, gestaoDepartamentos] = await Promise.all([
    db.userRole.findMany({
      where: { userId, tenantId },
      include: {
        role: {
          include: {
            departamento: {
              select: { permissions: true, permissionsGestor: true },
            },
          },
        },
      },
    }),
    db.userPermission.findMany({
      where: { userId, tenantId },
    }),
    db.userDepartamento.findMany({
      where: { userId, tenantId },
      include: { departamento: true },
    }),
    db.departamentoGestor.findMany({
      where: { userId, departamento: { tenantId } },
      include: { departamento: true },
    }),
  ])

  const base = new Set<string>()
  const coveredDeptoIds = new Set<string>()

  for (const ur of userRoles as Array<{
    role: {
      permissions: string[]
      permissionsExtras: string[]
      departamentoId: string | null
      papelNoDepartamento: string | null
      isSystem: boolean
      nome: string
      departamento: { permissions: string[]; permissionsGestor: string[] } | null
    }
  }>) {
    for (const p of permissionsOfRole(ur.role, ur.role.departamento)) {
      base.add(p)
    }
    if (ur.role.departamentoId) coveredDeptoIds.add(ur.role.departamentoId)
  }

  // Legado: membership de departamento sem perfil de área vinculado
  const gestorIds = new Set(
    gestaoDepartamentos.map((g: { departamentoId: string }) => g.departamentoId),
  )
  for (const ud of userDepartamentos as Array<{
    departamentoId: string
    departamento: { permissions: string[]; permissionsGestor: string[] }
  }>) {
    if (coveredDeptoIds.has(ud.departamentoId)) continue
    for (const p of ud.departamento.permissions) base.add(p)
    if (gestorIds.has(ud.departamentoId)) {
      for (const p of ud.departamento.permissionsGestor) base.add(p)
    }
  }
  for (const g of gestaoDepartamentos as Array<{
    departamentoId: string
    departamento: { permissions: string[]; permissionsGestor: string[] }
  }>) {
    if (coveredDeptoIds.has(g.departamentoId)) continue
    if (userDepartamentos.some((ud: { departamentoId: string }) => ud.departamentoId === g.departamentoId)) {
      continue
    }
    for (const p of g.departamento.permissions) base.add(p)
    for (const p of g.departamento.permissionsGestor) base.add(p)
  }

  return {
    rolePermissions: Array.from(base),
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
