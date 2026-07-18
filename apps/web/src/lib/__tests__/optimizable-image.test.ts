import { describe, expect, it } from 'vitest'
import { canOptimizeImageUrl } from '@/lib/optimizable-image'

describe('canOptimizeImageUrl', () => {
  it('aceita PNG/JPG no Cloudinary', () => {
    expect(
      canOptimizeImageUrl(
        'https://res.cloudinary.com/demo/image/upload/v1/logo.png',
      ),
    ).toBe(true)
  })

  it('recusa GIF animado (catálogo de torcidas)', () => {
    expect(
      canOptimizeImageUrl(
        'https://res.cloudinary.com/dyhzxaak/image/upload/v1/pavilhao-nove-sp.gif',
      ),
    ).toBe(false)
  })

  it('recusa SVG', () => {
    expect(
      canOptimizeImageUrl('https://res.cloudinary.com/demo/image/upload/v1/icon.svg'),
    ).toBe(false)
  })

  it('recusa host não permitido', () => {
    expect(canOptimizeImageUrl('https://example.com/a.png')).toBe(false)
  })
})
