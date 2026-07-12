import { cookies } from 'next/headers'
import { db } from '@torcida/db'
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
 */
export async function resolveUserTenantSlugForUser(userId: string): Promise<string | null> {
  const aprovado: { tenant: { slug: string } } | null = await db.saasMembro.findFirst({
    where: { userId, status: 'APROVADO' },
    orderBy: { criadoEm: 'desc' },
    select: { tenant: { select: { slug: true } } },
  })
  if (aprovado) return aprovado.tenant.slug

  const pendente: { tenant: { slug: string } } | null = await db.saasMembro.findFirst({
    where: { userId, status: 'PENDENTE' },
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
  if (!slug) return '/onboarding'

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

/** Lista enxuta para seletores de super-admin. */
export async function listarTorcidasParaSelecao(): Promise<TorcidaOpcao[]> {
  const torcidas: TorcidaOpcao[] = await db.tenant.findMany({
    where: { ativo: true },
    select: { id: true, slug: true, nome: true, corPrimaria: true },
    orderBy: { nome: 'asc' },
  })
  return torcidas
}
