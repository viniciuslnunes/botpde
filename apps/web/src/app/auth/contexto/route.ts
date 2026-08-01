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
import { lerSlugConviteDoCookie } from '@/lib/convite-cookie-server'

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

  // Convite direto sobrevive se o login perdeu o `callbackUrl` mas o proxy
  // gravou o cookie ao visitar `/convite/<slug>`.
  const conviteSlug = await lerSlugConviteDoCookie()
  const destinoOnboarding = conviteSlug
    ? `/onboarding?convite=${encodeURIComponent(conviteSlug)}`
    : '/onboarding'
  const destinoApelido = conviteSlug
    ? `/definir-apelido?callbackUrl=${encodeURIComponent(`/convite/${conviteSlug}`)}`
    : '/definir-apelido'

  // Nome + @ obrigatórios antes de onboarding/portal (OAuth e contas antigas).
  if (await usuarioPrecisaNickname(session.user.id)) {
    return NextResponse.redirect(publicUrl(destinoApelido, request))
  }

  if (await usuarioPrecisaOnboarding(session.user.id)) {
    return NextResponse.redirect(publicUrl(destinoOnboarding, request))
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
    return NextResponse.redirect(publicUrl(destinoOnboarding, request))
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
