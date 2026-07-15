import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { env, isProd } from '@/lib/env'
import { publicUrl } from '@/lib/request-origin'
import { sharedCookieOptions } from '@/lib/session-cookie'
import {
  isSuperAdminEmail,
  resolveUserTenantSlugForUser,
  usuarioPrecisaNickname,
  usuarioPrecisaOnboarding,
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
    return NextResponse.redirect(publicUrl('/entrar', request))
  }

  if (isSuperAdminEmail(session.user.email)) {
    return NextResponse.redirect(publicUrl('/super-admin/torcidas', request))
  }

  // Apelido obrigatório antes de onboarding/portal (contas novas e antigas).
  if (await usuarioPrecisaNickname(session.user.id)) {
    return NextResponse.redirect(publicUrl('/definir-apelido', request))
  }

  if (await usuarioPrecisaOnboarding(session.user.id)) {
    return NextResponse.redirect(publicUrl('/onboarding', request))
  }

  const slug = await resolveUserTenantSlugForUser(session.user.id)
  if (!slug) {
    const perfil = await db.perfilTorcedor.findUnique({
      where: { userId: session.user.id },
      select: { onboardingConcluidoEm: true, afiliacaoId: true },
    })
    if (perfil?.onboardingConcluidoEm) {
      return NextResponse.redirect(publicUrl('/portal/comunidade', request))
    }
    return NextResponse.redirect(publicUrl('/onboarding', request))
  }

  if (env.ROOT_DOMAIN) {
    const protocol = env.NODE_ENV === 'production' ? 'https' : 'http'
    return NextResponse.redirect(
      `${protocol}://${slug}.${env.ROOT_DOMAIN}/portal/comunidade`,
    )
  }

  const response = NextResponse.redirect(publicUrl('/portal/comunidade', request))
  response.cookies.set(TENANT_CTX_COOKIE, slug, sharedCookieOptions(isProd))
  return response
}
