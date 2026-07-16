import { revalidateTag } from 'next/cache'

/** Tag raiz para caches de leitura da Comunidade (feed, aside, stories). */
export const COMUNIDADE_FEED_CACHE_TAG = 'comunidade-feed'

export function tagFeedDescobrir(tenantId: string): string {
  return `${COMUNIDADE_FEED_CACHE_TAG}:descobrir:${tenantId}`
}

export function tagFeedSugestoes(tenantId: string): string {
  return `${COMUNIDADE_FEED_CACHE_TAG}:sugestoes:${tenantId}`
}

export function tagFeedHashtags(tenantId: string): string {
  return `${COMUNIDADE_FEED_CACHE_TAG}:hashtags:${tenantId}`
}

export function tagStoriesRings(tenantId: string): string {
  return `${COMUNIDADE_FEED_CACHE_TAG}:stories:${tenantId}`
}

export function tagCanaisVisiveis(tenantId: string): string {
  return `${COMUNIDADE_FEED_CACHE_TAG}:canais:${tenantId}`
}

export function tagSalasAtivas(tenantId: string): string {
  return `${COMUNIDADE_FEED_CACHE_TAG}:salas:${tenantId}`
}

/** Invalida caches cross-request após mutação de feed, stories ou social. */
export function invalidarCachesComunidadeFeed(tenantId: string): void {
  revalidateTag(tagFeedDescobrir(tenantId), 'max')
  revalidateTag(tagFeedSugestoes(tenantId), 'max')
  revalidateTag(tagFeedHashtags(tenantId), 'max')
  revalidateTag(tagStoriesRings(tenantId), 'max')
  revalidateTag(tagCanaisVisiveis(tenantId), 'max')
  revalidateTag(tagSalasAtivas(tenantId), 'max')
}
