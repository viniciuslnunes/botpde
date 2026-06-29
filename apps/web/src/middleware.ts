import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

const PUBLIC_PATHS = ['/entrar', '/api/auth', '/_next', '/favicon.ico']

export default auth((req) => {
  const { pathname } = req.nextUrl
  const session = req.auth

  // Permite rotas públicas sem verificação
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Redireciona não autenticados para login
  if (!session) {
    const loginUrl = new URL('/entrar', req.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Usuário autenticado tentando acessar /entrar → redireciona para portal
  if (pathname === '/entrar') {
    return NextResponse.redirect(new URL('/portal', req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
