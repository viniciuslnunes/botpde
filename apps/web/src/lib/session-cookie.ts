function resolvePublicDeployHost(): string | null {
  for (const raw of [
    process.env.AUTH_URL,
    process.env.NEXTAUTH_URL,
    process.env.RAILWAY_PUBLIC_DOMAIN,
  ]) {
    if (!raw) continue
    try {
      const url = raw.startsWith('http') ? raw : `https://${raw}`
      return new URL(url).hostname
    } catch {
      continue
    }
  }
  return null
}

/**
 * Domínio compartilhado para cookies de sessão e torcida_ctx.
 *
 * Só usa `.ROOT_DOMAIN` quando o host público do deploy pertence a esse domínio.
 * Evita que Railway (`*.up.railway.app`) com ROOT_DOMAIN=torcida.app quebre a
 * sessão — o browser descarta cookies cujo Domain não bate com o host atual.
 */
export function resolveSharedCookieDomain(): string | undefined {
  const rootDomain = process.env.ROOT_DOMAIN?.trim()
  if (!rootDomain) return undefined

  const root = rootDomain.toLowerCase()
  const publicHost = resolvePublicDeployHost()?.toLowerCase()

  if (!publicHost) {
    if (process.env.RAILWAY_PUBLIC_DOMAIN) return undefined
    return `.${root}`
  }

  if (publicHost === root || publicHost.endsWith(`.${root}`)) {
    return `.${root}`
  }

  return undefined
}

/** Opções base para cookies httpOnly de sessão/contexto. */
export function sharedCookieOptions(secure: boolean) {
  const domain = resolveSharedCookieDomain()
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure,
    ...(domain ? { domain } : {}),
  }
}
