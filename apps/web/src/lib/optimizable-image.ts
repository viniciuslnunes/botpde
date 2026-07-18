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

export function canOptimizeImageUrl(url: string): boolean {
  if (!url || url.startsWith('data:') || url.startsWith('/')) return false
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
