import { cookies } from 'next/headers'
import { db } from '@torcida/db'
import { SYSTEM_ROLES } from '@torcida/types'
import { env, isProd, superAdminEmails } from '@/lib/env'
import { sharedCookieOptions } from '@/lib/session-cookie'

/** Cookie httpOnly — torcida ativa quando não há subdomínio (single-tenant ou apex). */
export const TENANT_CTX_COOKIE = 'torcida_ctx'

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  return Boolean(email && superAdminEmails.includes(email))
}

export async function getTenantContextSlug(): Promise<string | null> {
  const cookieStore = await cookies()
  const value = cookieStore.get(TENANT_CTX_COOKIE)?.value?.trim()
  return value || null
}

export async function setTenantContextSlug(slug: string): Promise<void> {
  // Só válido em Server Actions e Route Handlers — não chamar de layouts/pages.
  const cookieStore = await cookies()
  cookieStore.set(TENANT_CTX_COOKIE, slug, sharedCookieOptions(isProd))
}

/** Usuário sem SaasMembro e sem onboarding concluído → hub /onboarding. */
export async function usuarioPrecisaOnboarding(userId: string): Promise<boolean> {
  const [membroCount, perfil] = await Promise.all([
    db.saasMembro.count({ where: { userId } }),
    db.perfilTorcedor.findUnique({
      where: { userId },
      select: { onboardingConcluidoEm: true },
    }),
  ])
  if (membroCount > 0) return false
  return !perfil?.onboardingConcluidoEm
}

/**
 * Slug da torcida do usuário (vínculo real). Sem fallback TENANT_SLUG —
 * use em roteamento pós-login; TENANT_SLUG é só contexto do deploy.
 *
 * `tipo: 'SOCIO'` — vínculo TORCEDOR (torcedor de uma torcida específica,
 * sem aprovação/comprovante) não abre um tenant próprio; cai no fallback de
 * torcedor global (Comunidade Nacional) em getActiveTenant. Só sócio (em
 * análise ou aprovado) resolve a torcida como tenant ativo.
 */
export async function resolveUserTenantSlugForUser(userId: string): Promise<string | null> {
  const aprovado: { tenant: { slug: string } } | null = await db.saasMembro.findFirst({
    where: { userId, status: 'APROVADO', tipo: 'SOCIO' },
    orderBy: { criadoEm: 'desc' },
    select: { tenant: { select: { slug: true } } },
  })
  if (aprovado) return aprovado.tenant.slug

  const pendente: { tenant: { slug: string } } | null = await db.saasMembro.findFirst({
    where: { userId, status: 'PENDENTE', tipo: 'SOCIO' },
    orderBy: { criadoEm: 'desc' },
    select: { tenant: { select: { slug: true } } },
  })
  if (pendente) return pendente.tenant.slug

  return null
}

/**
 * Slug da torcida "casa" do usuário: aprovado > pendente > fallback TENANT_SLUG.
 * Usado para resolver tenant ativo no portal (single-tenant), não pós-login.
 */
export async function resolveHomeTenantSlugForUser(userId: string): Promise<string | null> {
  const slug = await resolveUserTenantSlugForUser(userId)
  if (slug) return slug
  return env.TENANT_SLUG ?? null
}

/**
 * Destino pós-login (sem gravar cookie — use GET /auth/contexto).
 */
export async function resolvePortalHomeForUser(
  userId: string,
  email?: string | null,
): Promise<string> {
  if (isSuperAdminEmail(email)) {
    return '/super-admin/torcidas'
  }

  if (await usuarioPrecisaOnboarding(userId)) {
    return '/onboarding'
  }

  const slug = await resolveUserTenantSlugForUser(userId)
  if (!slug) {
    const perfil = await db.perfilTorcedor.findUnique({
      where: { userId },
      select: { onboardingConcluidoEm: true },
    })
    if (perfil?.onboardingConcluidoEm) {
      return env.ROOT_DOMAIN ? '/auth/contexto' : '/portal/comunidade'
    }
    return '/onboarding'
  }

  if (env.ROOT_DOMAIN) {
    const protocol = env.NODE_ENV === 'production' ? 'https' : 'http'
    return `${protocol}://${slug}.${env.ROOT_DOMAIN}/portal/comunidade`
  }

  return '/auth/contexto'
}

export type TorcidaOpcao = {
  id: string
  slug: string
  nome: string
  corPrimaria: string
}

export type TorcidaTransferencia = TorcidaOpcao & {
  temOwner: boolean
  ownerEmail: string | null
}

/** Lista enxuta para seletores de super-admin. */
export async function listarTorcidasParaSelecao(): Promise<TorcidaOpcao[]> {
  const torcidas: TorcidaOpcao[] = await db.tenant.findMany({
    where: { ativo: true, sintetico: false },
    select: { id: true, slug: true, nome: true, corPrimaria: true },
    orderBy: { nome: 'asc' },
  })
  return torcidas
}

/** Torcidas ativas com indicação de owner — para transferência no super-admin. */
export async function listarTorcidasParaTransferencia(): Promise<TorcidaTransferencia[]> {
  const [tenants, owners]: [
    TorcidaOpcao[],
    { tenantId: string; user: { email: string | null } }[],
  ] = await Promise.all([
    db.tenant.findMany({
      where: { ativo: true, sintetico: false },
      select: { id: true, slug: true, nome: true, corPrimaria: true },
      orderBy: { nome: 'asc' },
    }),
    db.userRole.findMany({
      where: { role: { nome: SYSTEM_ROLES.OWNER, isSystem: true } },
      select: { tenantId: true, user: { select: { email: true } } },
    }),
  ])

  const ownerPorTenant = new Map<string, string>()
  for (const o of owners) {
    if (o.user.email && !ownerPorTenant.has(o.tenantId)) {
      ownerPorTenant.set(o.tenantId, o.user.email)
    }
  }

  return tenants.map((t) => ({
    ...t,
    temOwner: ownerPorTenant.has(t.id),
    ownerEmail: ownerPorTenant.get(t.id) ?? null,
  }))
}
