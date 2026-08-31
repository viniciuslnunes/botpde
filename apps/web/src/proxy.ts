import { auth } from '@/lib/auth'
import { NextResponse, after } from 'next/server'
import { resetPrismaQueryCount, getAndResetPrismaMetrics, metricsEnabled } from '@torcida/db'
import { gravarConviteCookie, isConviteSlugShape } from '@/lib/convite-cookie'

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

function isSecureRequest(req: { nextUrl: { protocol: string } }): boolean {
  return process.env.NODE_ENV === 'production' || req.nextUrl.protocol === 'https:'
}

/**
 * `/convite/<slug>`: grava o slug em cookie curto antes do redirect de login.
 * Assim, se o `callbackUrl` se perder no cadastro/OAuth, o onboarding ainda
 * recupera o convite e não cai no passo Clube.
 */
function matchConviteSlug(pathname: string): string | null {
  const m = pathname.match(/^\/convite\/([^/]+)$/)
  if (!m?.[1]) return null
  try {
    const slug = decodeURIComponent(m[1]).trim()
    return isConviteSlugShape(slug) ? slug : null
  } catch {
    return null
  }
}

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

  const conviteSlug = matchConviteSlug(pathname)

  if (!session) {
    if (pathname.startsWith('/api/')) {
      return new NextResponse('Não autenticado', { status: 401 })
    }
    const loginUrl = req.nextUrl.clone()
    loginUrl.pathname = '/entrar'
    loginUrl.search = ''
    loginUrl.searchParams.set('callbackUrl', pathname)
    const res = NextResponse.redirect(loginUrl)
    if (conviteSlug) gravarConviteCookie(res, conviteSlug, isSecureRequest(req))
    return res
  }

  // Logado em `/convite/<slug>`: renova o cookie e deixa a página redirecionar.
  if (conviteSlug) {
    const res = NextResponse.next()
    gravarConviteCookie(res, conviteSlug, isSecureRequest(req))
    return res
  }

  if (pathname === '/entrar') {
    // Já logado: honra o destino do link (convite de unidade) em vez de jogar
    // tudo em /auth/contexto — descartar o `callbackUrl` aqui perde o convite.
    // Só caminho interno relativo (anti open redirect).
    const callbackUrl = req.nextUrl.searchParams.get('callbackUrl')
    const destinoSeguro =
      callbackUrl &&
      callbackUrl.startsWith('/') &&
      !callbackUrl.startsWith('//') &&
      !callbackUrl.startsWith('/\\')
        ? callbackUrl
        : null

    if (destinoSeguro) {
      return NextResponse.redirect(new URL(destinoSeguro, req.nextUrl))
    }
    const dest = req.nextUrl.clone()
    dest.pathname = '/auth/contexto'
    dest.search = ''
    return NextResponse.redirect(dest)
  }

  // Medição de rota: dev sempre; produção via PERF_METRICS=1 (opt-in).
  // Registrado aqui (não via headers() num Server Component) para não competir
  // com rotas que streamam atrás de loading.tsx — after() no proxy só dispara
  // quando a resposta inteira (incl. conteúdo suspenso) já foi enviada.
  if (metricsEnabled()) {
    const startedAt = Date.now()
    const method = req.method
    after(() => {
      const { count, dbMs } = getAndResetPrismaMetrics()
      if (count === 0) return
      const wallMs = Date.now() - startedAt

      if (process.env.NODE_ENV === 'development') {
        console.log(`[prisma] ${method} ${pathname} — ${count} queries (${Math.round(dbMs)}ms db)`)
        return
      }

      // Produção (PERF_METRICS=1): linha estruturada para agregação de p95.
      console.log(
        JSON.stringify({
          perf: 'route',
          method,
          route: pathname,
          queries: count,
          dbMs: Math.round(dbMs),
          wallMs,
          ts: new Date().toISOString(),
        }),
      )
    })
  }

  return NextResponse.next()
})

export const config = {
  // `_next` inteiro, não só static/image: o wrapper `auth()` roda ANTES do
  // early-return de PUBLIC_PATHS, então cada poll de HMR e cada chunk pedido em
  // dev pagava uma decodificação de JWT à toa. O early-return continua no corpo
  // como rede de segurança.
  matcher: ['/((?!_next/|favicon.ico).*)'],
}
