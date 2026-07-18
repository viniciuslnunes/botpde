/** Helpers de mídia e ranking para o hub /portal/comunidade/videos. */

import { isVideoUrl } from './comunidade-social'
import { cloudinaryVideoPoster } from './social-embed'
import type { PostSocialItem } from './feed'

export function resolveVideoSrc(post: PostSocialItem): string | null {
  const video = post.midiaUrls.find(isVideoUrl)
  if (video) return video
  if (post.imagemUrl && isVideoUrl(post.imagemUrl)) return post.imagemUrl
  return null
}

/** Poster leve (JPG Cloudinary) ou null — evita preload de vídeo na grade. */
export function resolveVideoPoster(post: PostSocialItem): string | null {
  const src = resolveVideoSrc(post)
  if (!src) return null
  if (src.includes('/video/upload/')) return cloudinaryVideoPoster(src)
  return null
}

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value)
}

/** Mesma heurística do Descobrir — engajamento + frescor + boost local. */
export function scoreVideoPost(post: PostSocialItem, tenantId: string): number {
  const ageHours = Math.max(0, (Date.now() - asDate(post.criadoEm).getTime()) / 3_600_000)
  const freshness = Math.max(0, 72 - ageHours) * 1.5
  const engagement = post.totalReacoes * 1.25 + post.totalComentarios * 2.25
  const localBoost = post.tenantId === tenantId ? 6 : 0
  return freshness + engagement + localBoost
}

export function rankVideosEmAlta(
  posts: PostSocialItem[],
  tenantId: string,
): PostSocialItem[] {
  return [...posts].sort((a, b) => {
    const diff = scoreVideoPost(b, tenantId) - scoreVideoPost(a, tenantId)
    if (diff !== 0) return diff
    return asDate(b.criadoEm).getTime() - asDate(a.criadoEm).getTime()
  })
}
