import { cookies } from 'next/headers'
import { db } from '@torcida/db'
import { env, isProd, superAdminEmails } from '@/lib/env'

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
  cookieStore.set(TENANT_CTX_COOKIE, slug, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: isProd,
    ...(env.ROOT_DOMAIN ? { domain: `.${env.ROOT_DOMAIN}` } : {}),
  })
}

/**
 * Slug da torcida "casa" do usuário: aprovado > pendente > fallback TENANT_SLUG.
 */
export async function resolveHomeTenantSlugForUser(userId: string): Promise<string | null> {
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

  const slug = await resolveHomeTenantSlugForUser(userId)
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
