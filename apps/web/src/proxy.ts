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

/**
 * SSE: o proxy `auth()` às vezes dá falso negativo. Redirect HTML para
 * `/entrar` (com `Connection: keep-alive`) vira ERR_HTTP2_PROTOCOL_ERROR no
 * EventSource — a rota valida a sessão e devolve 401/stream.
 */
function isSseStreamPath(pathname: string): boolean {
  return (
    pathname === '/api/notificacoes/stream' ||
    pathname === '/api/comunidade/feed/stream' ||
    pathname === '/api/conversas/stream' ||
    /^\/api\/conversas\/[^/]+\/stream$/.test(pathname)
  )
}

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

  // Nunca redirecionar EventSource/XHR para HTML de login.
  if (isSseStreamPath(pathname)) {
    return NextResponse.next()
  }

  if (!session) {
    if (pathname.startsWith('/api/')) {
      return new NextResponse('Não autenticado', { status: 401 })
    }
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
