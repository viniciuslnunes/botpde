import { describe, expect, it } from 'vitest'
import {
  ensureSocialEmbedInMidias,
  estimateEmbedHeight,
  firstSocialUrlInText,
  instagramEmbedSrc,
  nextTikTokEmbedFrameName,
  parseEmbedHeightMessage,
  scaleEmbedHeightToWidth,
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
  it('monta src de reel', () => {
    expect(instagramEmbedSrc(IG)).toBe(
      'https://www.instagram.com/reel/DSf2dEMDhNa/embed',
    )
  })

  it('monta src de post /p/', () => {
    expect(instagramEmbedSrc('https://www.instagram.com/p/AbCdEf/')).toBe(
      'https://www.instagram.com/p/AbCdEf/embed',
    )
  })
})

describe('estimateEmbedHeight', () => {
  it('escala TikTok/Reel com a largura do card (não usa teto fixo baixo)', () => {
    const narrow = estimateEmbedHeight('tiktok', TT, 325)
    const wide = estimateEmbedHeight('tiktok', TT, 520)
    expect(wide).toBeGreaterThan(narrow)
    expect(wide).toBeGreaterThan(900)
    expect(estimateEmbedHeight('instagram', IG, 520)).toBeGreaterThan(900)
  })

  it('Twitter começa com altura generosa para mídia', () => {
    expect(estimateEmbedHeight('twitter', TW, 520)).toBeGreaterThan(700)
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

describe('scaleEmbedHeightToWidth', () => {
  it('escala quando o card é mais largo que o player reportado', () => {
    expect(scaleEmbedHeightToWidth({ height: 740, width: 325 }, 520)).toBe(
      Math.ceil(740 * (520 / 325)),
    )
  })

  it('não escala quando a largura já é compatível', () => {
    expect(scaleEmbedHeightToWidth({ height: 900, width: 500 }, 520)).toBe(900)
  })
})

describe('nextTikTokEmbedFrameName', () => {
  it('gera nome com prefixo e 17 dígitos', () => {
    expect(nextTikTokEmbedFrameName()).toMatch(/^__tt_embed__v\d{17}$/)
  })
})
