import 'server-only'
import { cookies } from 'next/headers'
import { CONVITE_COOKIE, isConviteSlugShape } from '@/lib/convite-cookie'
import { isProd } from '@/lib/env'
import { sharedCookieOptions } from '@/lib/session-cookie'

/** Lê o slug do convite no cookie httpOnly (RSC / Server Action). */
export async function lerSlugConviteDoCookie(): Promise<string | null> {
  const store = await cookies()
  const raw = store.get(CONVITE_COOKIE)?.value
  return isConviteSlugShape(raw) ? raw : null
}

/**
 * Consome o cookie depois que o onboarding já tem o slug na URL/estado.
 * Só pode rodar em Server Action / Route Handler.
 */
export async function limparSlugConviteCookie(): Promise<void> {
  const store = await cookies()
  store.set(CONVITE_COOKIE, '', {
    ...sharedCookieOptions(isProd),
    maxAge: 0,
  })
}
