/** Hostnames permitidos em `next.config.ts` `images.remotePatterns`. */
const OPTIMIZED_HOSTS = new Set([
  'cdn.discordapp.com',
  'lh3.googleusercontent.com',
  'res.cloudinary.com',
  'gavioes.jetassets.com.br',
  'www.lojagavioes.com.br',
])

/** Extensões que o otimizador do Next não deve processar (GIF animado, SVG). */
const SKIP_OPTIMIZE_EXT = /\.(gif|svg)(?:$|\?)/i

/**
 * Discord CDN de anexo (`media.discordapp.net`, `/attachments/`, ephemeral)
 * expira (query `ex` hex) e vira 404 no console. Avatares em
 * `cdn.discordapp.com/avatars/` continuam ok.
 */
function isEphemeralDiscordCdnUrl(url: URL): boolean {
  const host = url.hostname
  if (host === 'media.discordapp.net' || host.endsWith('.discordapp.net')) {
    return true
  }
  if (host === 'cdn.discordapp.com') {
    const path = url.pathname
    if (path.includes('/attachments/') || path.includes('/ephemeral-attachments/')) {
      return true
    }
  }
  // URL assinada já vencida (ex. proxy Discord com `ex`+`hm`).
  const exRaw = url.searchParams.get('ex')
  if (exRaw && url.searchParams.has('hm')) {
    const ex = Number.parseInt(exRaw, 16)
    if (Number.isFinite(ex) && ex * 1000 <= Date.now()) return true
  }
  return false
}

/**
 * True se vale a pena pedir a imagem no browser.
 * False → não renderizar `<img>` (evita 404 de anexo Discord expirado).
 */
export function isDurableRemoteImageUrl(url: string): boolean {
  if (!url) return false
  if (url.startsWith('/') || url.startsWith('data:')) return true
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return false
    if (isEphemeralDiscordCdnUrl(parsed)) return false
    return true
  } catch {
    return false
  }
}

export function durableImageUrl(url: string | null | undefined): string | null {
  if (!url) return null
  return isDurableRemoteImageUrl(url) ? url : null
}

export function filterDurableImageUrls(urls: string[]): string[] {
  return urls.filter(isDurableRemoteImageUrl)
}

export function canOptimizeImageUrl(url: string): boolean {
  if (!url || url.startsWith('data:') || url.startsWith('/')) return false
  if (!isDurableRemoteImageUrl(url)) return false
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return false
    if (!OPTIMIZED_HOSTS.has(parsed.hostname)) return false
    // Catálogo de torcidas usa GIF animado no Cloudinary — next/image quebra
    // animação e, em alguns caminhos de SSR, pode falhar o render.
    if (SKIP_OPTIMIZE_EXT.test(parsed.pathname)) return false
    return true
  } catch {
    return false
  }
}
