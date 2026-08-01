import type { NextResponse } from 'next/server'
import { sharedCookieOptions } from '@/lib/session-cookie'

/**
 * Cookie de curto prazo que carrega o slug do convite pela cadeia
 * login → cadastro → apelido → onboarding.
 *
 * O `?convite=` na URL é a fonte canônica no wizard; o cookie é o
 * cinto de segurança quando algum elo perde o `callbackUrl` (o sintoma
 * clássico é cair em `/onboarding?passo=clube` com o link ainda válido).
 */
export const CONVITE_COOKIE = 'torcida_convite'

/** TTL curto: só precisa sobreviver o cadastro/login (1 h). */
export const CONVITE_COOKIE_MAX_AGE_SEC = 60 * 60

/** Formato do `generateInviteSlug()` (base64url de 6 bytes ≈ 8 chars). */
export function isConviteSlugShape(valor: unknown): valor is string {
  return typeof valor === 'string' && /^[A-Za-z0-9_-]{4,32}$/.test(valor)
}

function opcoesCookieConvite(secure: boolean) {
  return {
    ...sharedCookieOptions(secure),
    maxAge: CONVITE_COOKIE_MAX_AGE_SEC,
  }
}

/** Grava/atualiza o slug na resposta (proxy ou Route Handler). */
export function gravarConviteCookie(res: NextResponse, slug: string, secure: boolean): void {
  if (!isConviteSlugShape(slug)) return
  res.cookies.set(CONVITE_COOKIE, slug, opcoesCookieConvite(secure))
}

/** Remove o cookie na resposta (mesmo `secure`/domain usados na gravação). */
export function apagarConviteCookie(res: NextResponse, secure: boolean): void {
  res.cookies.set(CONVITE_COOKIE, '', {
    ...sharedCookieOptions(secure),
    maxAge: 0,
  })
}
