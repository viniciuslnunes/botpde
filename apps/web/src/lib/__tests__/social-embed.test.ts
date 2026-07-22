import { describe, expect, it } from 'vitest'
import {
  ensureSocialEmbedInMidias,
  firstSocialUrlInText,
  instagramEmbedSrc,
  stripEmbeddedSocialUrls,
} from '../social-embed'

const IG = 'https://www.instagram.com/reel/DSf2dEMDhNa/'

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
