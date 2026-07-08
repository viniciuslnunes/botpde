/**
 * Classificação de anexos do feed. `Post.midiaUrls` guarda tanto URLs de imagem
 * (Cloudinary) quanto links de redes sociais — aqui separamos e detectamos o
 * provedor de cada embed, sem depender de schema novo. Funções puras, usáveis
 * no cliente e no servidor.
 */

export type EmbedProvider = 'youtube' | 'twitter' | 'instagram' | 'tiktok'

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif|svg)(\?.*)?$/i

export const EMBED_HOSTS: Record<EmbedProvider, string> = {
  youtube: 'YouTube',
  twitter: 'X / Twitter',
  instagram: 'Instagram',
  tiktok: 'TikTok',
}

export function isCloudinaryUrl(url: string): boolean {
  return /^https:\/\/res\.cloudinary\.com\//.test(url)
}

export function detectEmbedProvider(url: string): EmbedProvider | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').replace(/^m\./, '')
    if (host === 'youtube.com' || host === 'youtu.be') return 'youtube'
    if (host === 'twitter.com' || host === 'x.com') return 'twitter'
    if (host === 'instagram.com') return 'instagram'
    if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) return 'tiktok'
    return null
  } catch {
    return null
  }
}

export function isSocialUrl(url: string): boolean {
  return detectEmbedProvider(url) !== null
}

export function isImageUrl(url: string): boolean {
  return isCloudinaryUrl(url) || IMAGE_EXT.test(url)
}

export function youTubeId(url: string): string | null {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    if (host === 'youtu.be') return u.pathname.slice(1) || null
    const v = u.searchParams.get('v')
    if (v) return v
    const m = u.pathname.match(/\/(embed|shorts|live)\/([^/?]+)/)
    return m ? m[2] : null
  } catch {
    return null
  }
}

/** Separa os anexos em imagens e embeds sociais, preservando a ordem. */
export function classifyMedia(urls: string[]): { images: string[]; embeds: string[] } {
  const images: string[] = []
  const embeds: string[] = []
  for (const url of urls) {
    if (isSocialUrl(url)) embeds.push(url)
    else if (url) images.push(url)
  }
  return { images, embeds }
}

/** Primeira URL de rede social encontrada num texto — usada pelo composer. */
export function firstSocialUrlInText(text: string): string | null {
  const matches = text.match(/https?:\/\/[^\s]+/g)
  if (!matches) return null
  for (const raw of matches) {
    const url = raw.replace(/[.,);]+$/, '')
    if (isSocialUrl(url)) return url
  }
  return null
}
