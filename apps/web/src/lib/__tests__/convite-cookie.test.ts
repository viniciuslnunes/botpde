import { describe, expect, it } from 'vitest'
import { isConviteSlugShape } from '@/lib/convite-cookie'

describe('isConviteSlugShape', () => {
  it('aceita slug base64url típico do generateInviteSlug', () => {
    expect(isConviteSlugShape('Ab3-_xYz')).toBe(true)
    expect(isConviteSlugShape('abcdefgh')).toBe(true)
  })

  it('recusa vazio, curto demais ou caracteres estranhos', () => {
    expect(isConviteSlugShape('')).toBe(false)
    expect(isConviteSlugShape('ab')).toBe(false)
    expect(isConviteSlugShape('abc def')).toBe(false)
    expect(isConviteSlugShape('../etc')).toBe(false)
    expect(isConviteSlugShape(null)).toBe(false)
    expect(isConviteSlugShape(undefined)).toBe(false)
  })
})
