import { describe, expect, it } from 'vitest'
import {
  applyEmbedHeightReport,
  ensureSocialEmbedInMidias,
  firstSocialUrlInText,
  instagramEmbedSrc,
  parseEmbedHeightMessage,
  resolveEmbedFrameWidth,
  stripEmbeddedSocialUrls,
  tiktokVideoId,
} from '../social-embed'

const IG = 'https://www.instagram.com/reel/DSf2dEMDhNa/'
const TT = 'https://www.tiktok.com/@user/video/1234567890123456789'

describe('firstSocialUrlInText', () => {
  it('encontra URL com texto acima', () => {
    expect(firstSocialUrlInText(`OS DE PRETO É VAGABUNDO\n${IG}`)).toBe(IG)
  })

  it('encontra URL com texto abaixo', () => {
    expect(firstSocialUrlInText(`${IG}\nOS DE PRETO É VAGABUNDO`)).toBe(IG)
  })

  it('encontra URL no meio da linha', () => {
    expect(firstSocialUrlInText(`olha isso ${IG} agora`)).toBe(IG)
  })
})

describe('stripEmbeddedSocialUrls', () => {
  it('remove linha só com a URL e mantém texto acima', () => {
    expect(stripEmbeddedSocialUrls(`OS DE PRETO É VAGABUNDO\n${IG}`, [IG])).toBe(
      'OS DE PRETO É VAGABUNDO',
    )
  })

  it('remove linha só com a URL e mantém texto abaixo', () => {
    expect(stripEmbeddedSocialUrls(`${IG}\nOS DE PRETO É VAGABUNDO`, [IG])).toBe(
      'OS DE PRETO É VAGABUNDO',
    )
  })

  it('remove URL no meio e mantém o resto', () => {
    expect(stripEmbeddedSocialUrls(`olha ${IG} agora`, [IG])).toBe('olha agora')
  })

  it('não altera texto sem midia social', () => {
    expect(stripEmbeddedSocialUrls(`${IG}\ntexto`, [])).toBe(`${IG}\ntexto`)
  })
})

describe('ensureSocialEmbedInMidias', () => {
  it('adiciona embed do texto quando midias não tem social', () => {
    expect(ensureSocialEmbedInMidias(`texto\n${IG}`, [])).toEqual([IG])
  })

  it('não duplica se já existe', () => {
    expect(ensureSocialEmbedInMidias(IG, [IG])).toEqual([IG])
  })
})

describe('instagramEmbedSrc', () => {
  it('monta src de reel com wp nativo', () => {
    expect(instagramEmbedSrc(IG)).toBe(
      'https://www.instagram.com/reel/DSf2dEMDhNa/embed/?cr=1&v=14&wp=540',
    )
  })
})

describe('resolveEmbedFrameWidth', () => {
  it('limita TikTok/IG/X à largura nativa do player', () => {
    expect(resolveEmbedFrameWidth('tiktok', 520)).toBe(325)
    expect(resolveEmbedFrameWidth('instagram', 700)).toBe(540)
    expect(resolveEmbedFrameWidth('twitter', 700)).toBe(550)
  })

  it('não ultrapassa a largura do card no mobile', () => {
    expect(resolveEmbedFrameWidth('twitter', 320)).toBe(320)
  })
})

describe('tiktokVideoId', () => {
  it('extrai id do path /video/', () => {
    expect(tiktokVideoId(TT)).toBe('1234567890123456789')
  })
})

describe('parseEmbedHeightMessage', () => {
  it('lê height do TikTok', () => {
    expect(parseEmbedHeightMessage('tiktok', { height: 978, width: 325 })).toEqual({
      height: 978,
      width: 325,
    })
  })
})

describe('applyEmbedHeightReport', () => {
  it('aplica buffer sem upscale', () => {
    expect(applyEmbedHeightReport({ height: 740, width: 325 })).toBe(744)
  })
})
