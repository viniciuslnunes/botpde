import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { resetPrismaQueryCount } from '@torcida/db'

const PUBLIC_PATHS = [
  '/entrar',
  '/api/auth',
  // Checagem de @ no cadastro (ainda sem sessão).
  '/api/nickname',
  '/_next',
  '/favicon.ico',
  // Stickers locais — o otimizador de imagem busca sem sessão.
  '/stickers',
]

/** Auth real fica no Route Handler / página — evita falso negativo do proxy. */
const AUTH_DEFER_PATHS = ['/auth/contexto', '/onboarding', '/definir-apelido']

export const proxy = auth((req) => {
  if (process.env.NODE_ENV === 'development') {
    resetPrismaQueryCount()
  }

  const { pathname } = req.nextUrl
  const session = req.auth

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  if (AUTH_DEFER_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  if (!session) {
    const loginUrl = req.nextUrl.clone()
    loginUrl.pathname = '/entrar'
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (pathname === '/entrar') {
    const dest = req.nextUrl.clone()
    dest.pathname = '/auth/contexto'
    dest.search = ''
    return NextResponse.redirect(dest)
  }

  const requestHeaders = new Headers(req.headers)
  if (process.env.NODE_ENV === 'development') {
    requestHeaders.set('x-pathname', pathname)
    requestHeaders.set('x-method', req.method)
  }

  return NextResponse.next({ request: { headers: requestHeaders } })
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
