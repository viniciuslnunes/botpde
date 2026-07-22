import { describe, expect, it } from 'vitest'
import {
  applyEmbedHeightReport,
  ensureSocialEmbedInMidias,
  estimateEmbedHeight,
  firstSocialUrlInText,
  instagramEmbedSrc,
  nextTikTokEmbedFrameName,
  parseEmbedHeightMessage,
  resolveEmbedFrameWidth,
  stripEmbeddedSocialUrls,
} from '../social-embed'

const IG = 'https://www.instagram.com/reel/DSf2dEMDhNa/'
const TT = 'https://www.tiktok.com/@user/video/1234567890123456789'
const TW = 'https://x.com/user/status/1234567890123456789'

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
      'https://www.instagram.com/reel/DSf2dEMDhNa/embed/?cr=1&v=14&wp=400',
    )
  })

  it('monta src de post /p/', () => {
    expect(instagramEmbedSrc('https://www.instagram.com/p/AbCdEf/', 320)).toBe(
      'https://www.instagram.com/p/AbCdEf/embed/?cr=1&v=14&wp=320',
    )
  })
})

describe('resolveEmbedFrameWidth', () => {
  it('limita TikTok/IG/X à largura nativa do player', () => {
    expect(resolveEmbedFrameWidth('tiktok', 520)).toBe(325)
    expect(resolveEmbedFrameWidth('instagram', 520)).toBe(400)
    expect(resolveEmbedFrameWidth('twitter', 700)).toBe(550)
  })

  it('não ultrapassa a largura do card no mobile', () => {
    expect(resolveEmbedFrameWidth('twitter', 320)).toBe(320)
  })
})

describe('estimateEmbedHeight', () => {
  it('usa largura nativa — card largo não infla o TikTok', () => {
    expect(estimateEmbedHeight('tiktok', TT, 520)).toBe(estimateEmbedHeight('tiktok', TT, 325))
    expect(estimateEmbedHeight('tiktok', TT, 325)).toBeGreaterThan(850)
  })

  it('Twitter estima na largura do tweet (≤550)', () => {
    expect(estimateEmbedHeight('twitter', TW, 700)).toBe(estimateEmbedHeight('twitter', TW, 550))
  })
})

describe('parseEmbedHeightMessage', () => {
  it('lê resize do X/Twitter', () => {
    expect(
      parseEmbedHeightMessage('twitter', {
        method: 'twttr.private.resize',
        params: [{ width: 550, height: 812 }],
      }),
    ).toEqual({ height: 812, width: 550 })
  })

  it('lê MEASURE do Instagram (string JSON)', () => {
    expect(
      parseEmbedHeightMessage(
        'instagram',
        JSON.stringify({ type: 'MEASURE', details: { height: 1040 } }),
      ),
    ).toEqual({ height: 1040 })
  })

  it('lê height do TikTok', () => {
    expect(parseEmbedHeightMessage('tiktok', { height: 978, width: 325 })).toEqual({
      height: 978,
      width: 325,
    })
  })

  it('ignora mensagens sem altura útil', () => {
    expect(parseEmbedHeightMessage('tiktok', { type: 'ping' })).toBeNull()
    expect(parseEmbedHeightMessage('instagram', { type: 'MEASURE', details: {} })).toBeNull()
  })
})

describe('applyEmbedHeightReport', () => {
  it('aplica buffer sem upscale pela largura do card', () => {
    expect(applyEmbedHeightReport({ height: 740, width: 325 })).toBe(744)
  })
})

describe('nextTikTokEmbedFrameName', () => {
  it('gera nome com prefixo e 17 dígitos', () => {
    expect(nextTikTokEmbedFrameName()).toMatch(/^__tt_embed__v\d{17}$/)
  })
})
