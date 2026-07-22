import { describe, expect, it, vi } from 'vitest'
import {
  COMUNIDADE_FEED_CACHE_TAG,
  invalidarCachesComunidadeFeed,
  tagFeedDescobrir,
  tagFeedHashtags,
} from '@/lib/comunidade-cache'

vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
}))

import { revalidateTag } from 'next/cache'

describe('comunidade-cache', () => {
  it('gera tags por tenant', () => {
    expect(tagFeedDescobrir('t1')).toBe(`${COMUNIDADE_FEED_CACHE_TAG}:descobrir:t1`)
    expect(tagFeedHashtags('t1')).toBe(`${COMUNIDADE_FEED_CACHE_TAG}:hashtags:t1`)
  })

  it('invalida todos os blocos de leitura do feed', () => {
    invalidarCachesComunidadeFeed('tenant-x')
    expect(revalidateTag).toHaveBeenCalledTimes(7)
    expect(revalidateTag).toHaveBeenCalledWith(`${COMUNIDADE_FEED_CACHE_TAG}:descobrir:tenant-x`, 'max')
    expect(revalidateTag).toHaveBeenCalledWith(`${COMUNIDADE_FEED_CACHE_TAG}:hashtags:tenant-x`, 'max')
    expect(revalidateTag).toHaveBeenCalledWith(`${COMUNIDADE_FEED_CACHE_TAG}:autor-badges:tenant-x`, 'max')
  })
})
