import { NextResponse } from 'next/server'
import { COMUNIDADE_CANAL_FOCO_COOKIE } from '@/lib/comunidade-canal-foco-cookie'
import { isProd } from '@/lib/env'
import { publicUrl } from '@/lib/request-origin'
import { sharedCookieOptions } from '@/lib/session-cookie'

const DESTINO_PADRAO = '/portal/comunidade?escopo=torcida'

/** Só caminhos internos da Comunidade — evita open redirect. */
function destinoSeguro(raw: string | null): string {
  if (!raw) return DESTINO_PADRAO
  if (!raw.startsWith('/portal/comunidade')) return DESTINO_PADRAO
  if (raw.startsWith('//') || raw.includes('://')) return DESTINO_PADRAO
  return raw
}

/**
 * Limpa o cookie de foco Caso A. Cookies só podem ser alterados em
 * Route Handler / Server Action — a page `/portal/comunidade` redireciona
 * para cá quando `?raiz=1` ou quando o id do cookie ficou inválido.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const next = destinoSeguro(url.searchParams.get('next'))
  const response = NextResponse.redirect(publicUrl(next, request))
  response.cookies.set(COMUNIDADE_CANAL_FOCO_COOKIE, '', {
    ...sharedCookieOptions(isProd),
    httpOnly: true,
    maxAge: 0,
  })
  return response
}
