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
 */
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/entrar', request.url))
  }

  if (isSuperAdminEmail(session.user.email)) {
    return NextResponse.redirect(new URL('/super-admin/torcidas', request.url))
  }

  const slug = await resolveHomeTenantSlugForUser(session.user.id)
  if (!slug) {
    return NextResponse.redirect(new URL('/onboarding', request.url))
  }

  if (env.ROOT_DOMAIN) {
    const protocol = env.NODE_ENV === 'production' ? 'https' : 'http'
    return NextResponse.redirect(
      `${protocol}://${slug}.${env.ROOT_DOMAIN}/portal/comunidade`,
    )
  }

  const response = NextResponse.redirect(new URL('/portal/comunidade', request.url))
  response.cookies.set(TENANT_CTX_COOKIE, slug, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: isProd,
  })
  return response
}
