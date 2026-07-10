import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { resetPrismaQueryCount } from '@torcida/db'

const PUBLIC_PATHS = ['/entrar', '/api/auth', '/_next', '/favicon.ico']

export const proxy = auth((req) => {
  if (process.env.NODE_ENV === 'development') {
    resetPrismaQueryCount()
  }

  const { pathname } = req.nextUrl
  const session = req.auth

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  if (!session) {
    const loginUrl = new URL('/entrar', req.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (pathname === '/entrar') {
    return NextResponse.redirect(new URL('/portal/comunidade', req.url))
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
