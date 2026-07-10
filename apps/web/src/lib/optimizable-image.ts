/** Hostnames permitidos em `next.config.ts` `images.remotePatterns`. */
const OPTIMIZED_HOSTS = new Set([
  'cdn.discordapp.com',
  'lh3.googleusercontent.com',
  'res.cloudinary.com',
  'gavioes.jetassets.com.br',
  'www.lojagavioes.com.br',
])

export function canOptimizeImageUrl(url: string): boolean {
  if (!url || url.startsWith('data:') || url.startsWith('/')) return false
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return false
    return OPTIMIZED_HOSTS.has(parsed.hostname)
  } catch {
    return false
  }
}
