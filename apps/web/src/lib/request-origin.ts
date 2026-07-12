/**
 * Host efetivo da requisição atrás de proxy (Railway, Cloudflare, etc.).
 * Next.js compara Origin vs Host/X-Forwarded-Host em Server Actions — tenant
 * e redirects precisam usar o mesmo valor.
 *
 * Sem dependência de `@/lib/env` — usável em testes sem carregar o schema completo.
 */
export function resolveRequestHost(
  forwardedHost: string | null | undefined,
  host: string | null | undefined,
): string {
  return forwardedHost?.split(',')[0]?.trim() || host?.trim() || ''
}

/**
 * Origem pública da requisição (Railway/Vercel atrás de proxy).
 * Evita redirects para localhost quando request.url reflete o host interno.
 */
export function getPublicOrigin(request: Request): string {
  const host = resolveRequestHost(
    request.headers.get('x-forwarded-host'),
    request.headers.get('host'),
  )

  if (host) {
    const forwardedProto = request.headers.get('x-forwarded-proto')
    const protocol =
      forwardedProto?.split(',')[0]?.trim()
      ?? (process.env.NODE_ENV === 'production' ? 'https' : 'http')
    return `${protocol}://${host}`
  }

  const rootDomain = process.env.ROOT_DOMAIN?.trim()
  if (rootDomain && process.env.NODE_ENV === 'production') {
    return `https://${rootDomain}`
  }

  return new URL(request.url).origin
}

/** Monta URL absoluta pública para redirects cross-origin quando necessário. */
export function publicUrl(path: string, request: Request): URL {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return new URL(normalized, getPublicOrigin(request))
}
