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

/** Salas visíveis na Comunidade Nacional (sintético + ABERTA das unidades do clube). */
export function tagSalasNacionais(afiliacaoId: string): string {
  return `${COMUNIDADE_FEED_CACHE_TAG}:salas-nacionais:${afiliacaoId}`
}

/** Feed Descobrir da Comunidade Nacional (por afiliação). */
export function tagFeedNacional(afiliacaoId: string): string {
  return `${COMUNIDADE_FEED_CACHE_TAG}:nacional:${afiliacaoId}`
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

export function invalidarFeedNacional(afiliacaoId: string): void {
  revalidateTag(tagFeedNacional(afiliacaoId), 'max')
}

/** Invalida listagens de salas após entrada/saída de participante (presença). */
export function invalidarCacheSalasPresenca(tenantId: string, afiliacaoId?: string | null): void {
  revalidateTag(tagSalasAtivas(tenantId), 'max')
  if (afiliacaoId) {
    revalidateTag(tagSalasNacionais(afiliacaoId), 'max')
  }
}
