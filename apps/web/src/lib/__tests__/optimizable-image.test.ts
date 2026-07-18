import { describe, expect, it } from 'vitest'
import {
  canOptimizeImageUrl,
  durableImageUrl,
  isDurableRemoteImageUrl,
} from '@/lib/optimizable-image'

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

  it('recusa anexo Discord efêmero (não otimiza)', () => {
    expect(
      canOptimizeImageUrl(
        'https://media.discordapp.net/ephemeral-attachments/1/2/imagem1.png?ex=6a473d60&is=1&hm=abc',
      ),
    ).toBe(false)
  })
})

describe('isDurableRemoteImageUrl', () => {
  it('aceita avatar Discord estável', () => {
    expect(
      isDurableRemoteImageUrl('https://cdn.discordapp.com/avatars/123/abcdef.png'),
    ).toBe(true)
  })

  it('recusa media.discordapp.net / ephemeral', () => {
    expect(
      isDurableRemoteImageUrl(
        'https://media.discordapp.net/ephemeral-attachments/1493461657433935902/1522099770964054128/imagem1.png?ex=6a473d60&is=6a45ebe0&hm=d803',
      ),
    ).toBe(false)
  })

  it('recusa cdn.discordapp.com/attachments', () => {
    expect(
      isDurableRemoteImageUrl(
        'https://cdn.discordapp.com/attachments/1/2/foto.png?ex=ffffffff&hm=x',
      ),
    ).toBe(false)
  })

  it('durableImageUrl devolve null para efêmero', () => {
    expect(
      durableImageUrl(
        'https://media.discordapp.net/ephemeral-attachments/1/2/x.png?ex=1&hm=1',
      ),
    ).toBeNull()
  })
})
