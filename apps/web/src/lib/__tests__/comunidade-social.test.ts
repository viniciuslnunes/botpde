import { describe, expect, it } from 'vitest'
import {
  extrairMencoes,
  extrairHashtags,
  normalizarHashtag,
  formatarMencao,
  isVideoUrl,
  linkPostComunidade,
} from '../comunidade-social'

describe('comunidade-social', () => {
  it('extrai menções no formato @[Nome](user:uuid)', () => {
    const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    const texto = `Olá @[João](user:${id}) e @[Maria](user:${id})`
    const mencoes = extrairMencoes(texto)
    expect(mencoes).toHaveLength(1)
    expect(mencoes[0]).toEqual({ nome: 'João', userId: id })
  })

  it('extrai hashtags e normaliza', () => {
    const tags = extrairHashtags('Jogo do #Gaviões e #FORÇA')
    expect(tags).toContain('gavioes')
    expect(tags).toContain('forca')
    expect(normalizarHashtag('Gaviões')).toBe('gavioes')
  })

  it('formata menção para o composer', () => {
    const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    expect(formatarMencao('Ana', id)).toBe(`@[Ana](user:${id}) `)
  })

  it('detecta URLs de vídeo', () => {
    expect(isVideoUrl('https://res.cloudinary.com/x/video/upload/v1/a.mp4')).toBe(true)
    expect(isVideoUrl('https://res.cloudinary.com/x/image/upload/v1/a.jpg')).toBe(false)
  })

  it('limita menções distintas extraídas', () => {
    const ids = Array.from({ length: 12 }, (_, i) =>
      `a1b2c3d4-e5f6-7890-abcd-ef1234567${String(i).padStart(3, '0')}`,
    )
    const texto = ids.map((id, i) => `@[User${i}](user:${id})`).join(' ')
    expect(extrairMencoes(texto).length).toBe(12)
  })

  it('gera permalink de post', () => {
    expect(linkPostComunidade('abc-123')).toBe('/portal/comunidade/post/abc-123')
  })
})
