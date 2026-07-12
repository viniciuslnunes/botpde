import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { env, isProd } from '@/lib/env'
import {
  isSuperAdminEmail,
  resolveHomeTenantSlugForUser,
  TENANT_CTX_COOKIE,
} from '@/lib/tenant-context'

/**
 * Pós-login: define cookie de torcida (single-tenant) ou redireciona
 * para subdomínio (multi-tenant). Cookies só podem ser gravados aqui
 * (Route Handler), não em layouts/pages.
 *
 * Redirects same-origin usam path relativo — evita localhost quando
 * request.url reflete o host interno do container (Railway).
 */
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.redirect('/entrar')
  }

  if (isSuperAdminEmail(session.user.email)) {
    return NextResponse.redirect('/super-admin/torcidas')
  }

  const slug = await resolveHomeTenantSlugForUser(session.user.id)
  if (!slug) {
    return NextResponse.redirect('/onboarding')
  }

  if (env.ROOT_DOMAIN) {
    const protocol = env.NODE_ENV === 'production' ? 'https' : 'http'
    return NextResponse.redirect(
      `${protocol}://${slug}.${env.ROOT_DOMAIN}/portal/comunidade`,
    )
  }

  const response = NextResponse.redirect('/portal/comunidade')
  response.cookies.set(TENANT_CTX_COOKIE, slug, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: isProd,
  })
  return response
}
