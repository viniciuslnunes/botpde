import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { env, isProd } from '@/lib/env'
import { publicUrl } from '@/lib/request-origin'
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
 * Route Handlers exigem URL absoluta em NextResponse.redirect — usar
 * publicUrl() para respeitar x-forwarded-host no Railway (não localhost).
 */
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.redirect(publicUrl('/entrar', request))
  }

  if (isSuperAdminEmail(session.user.email)) {
    return NextResponse.redirect(publicUrl('/super-admin/torcidas', request))
  }

  const slug = await resolveHomeTenantSlugForUser(session.user.id)
  if (!slug) {
    return NextResponse.redirect(publicUrl('/onboarding', request))
  }

  if (env.ROOT_DOMAIN) {
    const protocol = env.NODE_ENV === 'production' ? 'https' : 'http'
    return NextResponse.redirect(
      `${protocol}://${slug}.${env.ROOT_DOMAIN}/portal/comunidade`,
    )
  }

  const response = NextResponse.redirect(publicUrl('/portal/comunidade', request))
  response.cookies.set(TENANT_CTX_COOKIE, slug, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: isProd,
  })
  return response
}
