import { describe, expect, it } from 'vitest'
import {
  extrairMencoes,
  extrairHashtags,
  normalizarHashtag,
  formatarMencao,
  formatarMencaoLegivel,
  paraTextoLegivel,
  serializarMencoes,
  podarMencoes,
  isVideoUrl,
  linkPostComunidade,
  linkTopicoForum,
  linkNoticiaPortal,
} from '../comunidade-social'
import { detectarMencaoAtiva } from '@/components/portal/mention-picker'

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

  it('formata menção para persistência e composer legível', () => {
    const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    expect(formatarMencao('Ana', id)).toBe(`@[Ana](user:${id}) `)
    expect(formatarMencaoLegivel('Ellen Akemi')).toBe('@Ellen Akemi ')
  })

  it('converte token ↔ texto legível no composer', () => {
    const id = '8b2508bb-0fd4-4c81-a27e-778feb402d2a'
    const persistido = `@[Ellen Akemi](user:${id}) te amo`
    const { texto, mencoes } = paraTextoLegivel(persistido)
    expect(texto).toBe('@Ellen Akemi te amo')
    expect(mencoes).toEqual([{ nome: 'Ellen Akemi', userId: id }])
    expect(serializarMencoes(texto, mencoes)).toBe(persistido)
  })

  it('poda menções removidas do texto', () => {
    const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    const mencoes = [{ nome: 'Ana', userId: id }]
    expect(podarMencoes('@Ana oi', mencoes)).toHaveLength(1)
    expect(podarMencoes('oi Ana', mencoes)).toHaveLength(0)
  })

  it('detecta menção ativa só enquanto digita', () => {
    expect(detectarMencaoAtiva('fala @Ell', 9)).toBe('Ell')
    expect(detectarMencaoAtiva('@Ellen Akemi ', 13)).toBeNull()
  })

  it('detecta URLs de vídeo', () => {
    expect(isVideoUrl('https://res.cloudinary.com/x/video/upload/v1/a.mp4')).toBe(true)
    expect(isVideoUrl('https://cdn.example.com/clip.m4v?token=1')).toBe(true)
    expect(isVideoUrl('https://res.cloudinary.com/x/image/upload/v1/a.jpg')).toBe(false)
    expect(isVideoUrl('https://www.youtube.com/watch?v=abc')).toBe(false)
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

  it('gera permalink do tópico no fórum e da matéria no portal de notícias', () => {
    expect(linkTopicoForum('top-1', 'nacional')).toBe(
      '/portal/comunidade/forum/top-1?escopo=nacional',
    )
    expect(linkNoticiaPortal('not-1', 'torcida')).toBe(
      '/portal/comunidade/noticias/not-1?escopo=torcida',
    )
  })
})
