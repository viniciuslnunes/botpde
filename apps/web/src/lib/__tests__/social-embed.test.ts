import { describe, expect, it } from 'vitest'
import {
  applyEmbedHeightReport,
  classifyMedia,
  detectEmbedProvider,
  ensureSocialEmbedInMidias,
  firstSocialUrlInText,
  instagramEmbedSrc,
  instagramPermalink,
  midiasAposEditarConteudo,
  midiasComEmbedDoTexto,
  parseEmbedHeightMessage,
  resolveEmbedFrameWidth,
  stripEmbeddedSocialUrls,
  tiktokVideoId,
  twitterEmbedSrc,
  twitterStatusId,
  youTubeId,
  embedSupportsColorScheme,
} from '../social-embed'

const SOCIAL_URLS = {
  youtube: 'https://www.youtube.com/watch?v=O_rzxRdKgkU',
  youtubeShort: 'https://www.youtube.com/shorts/O_rzxRdKgkU',
  youtubeMobile: 'https://m.youtube.com/watch?v=O_rzxRdKgkU',
  youtubeShortLink: 'https://youtu.be/O_rzxRdKgkU',
  twitter: 'https://twitter.com/user/status/1234567890123456789',
  x: 'https://x.com/user/status/1234567890123456789',
  xMobile: 'https://mobile.x.com/user/status/1234567890123456789',
  instagram: 'https://www.instagram.com/reel/DSf2dEMDhNa/',
  instagramPost: 'https://www.instagram.com/p/ABC123xyz/',
  tiktok: 'https://www.tiktok.com/@user/video/1234567890123456789',
} as const

describe('detectEmbedProvider — todas as redes', () => {
  it.each([
    ['youtube', SOCIAL_URLS.youtube],
    ['youtube', SOCIAL_URLS.youtubeShort],
    ['youtube', SOCIAL_URLS.youtubeMobile],
    ['youtube', SOCIAL_URLS.youtubeShortLink],
    ['twitter', SOCIAL_URLS.twitter],
    ['twitter', SOCIAL_URLS.x],
    ['twitter', SOCIAL_URLS.xMobile],
    ['instagram', SOCIAL_URLS.instagram],
    ['instagram', SOCIAL_URLS.instagramPost],
    ['tiktok', SOCIAL_URLS.tiktok],
  ] as const)('detecta %s em %s', (provider, url) => {
    expect(detectEmbedProvider(url)).toBe(provider)
  })
})

describe('firstSocialUrlInText — todas as redes', () => {
  it.each(Object.entries(SOCIAL_URLS))('encontra URL de %s no texto', (_name, url) => {
    expect(firstSocialUrlInText(`olha isso\n${url}`)).toBe(url)
  })

  it('normaliza YouTube sem protocolo (cola típica)', () => {
    expect(firstSocialUrlInText('youtube.com/watch?v=O_rzxRdKgkU')).toBe(
      'https://youtube.com/watch?v=O_rzxRdKgkU',
    )
  })

  it('normaliza www.youtube sem protocolo', () => {
    expect(firstSocialUrlInText('www.youtube.com/watch?v=O_rzxRdKgkU')).toBe(
      'https://www.youtube.com/watch?v=O_rzxRdKgkU',
    )
  })

  it('normaliza youtu.be sem protocolo', () => {
    expect(firstSocialUrlInText('youtu.be/O_rzxRdKgkU')).toBe('https://youtu.be/O_rzxRdKgkU')
  })

  it('normaliza Instagram e X sem protocolo', () => {
    expect(firstSocialUrlInText('instagram.com/reel/DSf2dEMDhNa/')).toBe(
      'https://instagram.com/reel/DSf2dEMDhNa/',
    )
    expect(firstSocialUrlInText('x.com/user/status/1234567890123456789')).toBe(
      'https://x.com/user/status/1234567890123456789',
    )
  })
})

describe('ensureSocialEmbedInMidias — todas as redes', () => {
  it.each(Object.values(SOCIAL_URLS))('promove %s do texto para midias', (url) => {
    expect(ensureSocialEmbedInMidias(`texto\n${url}`, [])).toEqual([url])
  })

  it('promove YouTube sem protocolo para midias com https', () => {
    expect(ensureSocialEmbedInMidias('youtube.com/watch?v=O_rzxRdKgkU', [])).toEqual([
      'https://youtube.com/watch?v=O_rzxRdKgkU',
    ])
  })

  it('mantém só um embed social quando já existe outro', () => {
    expect(ensureSocialEmbedInMidias(SOCIAL_URLS.youtube, [SOCIAL_URLS.instagram])).toEqual([
      SOCIAL_URLS.instagram,
    ])
  })
})

describe('stripEmbeddedSocialUrls — todas as redes', () => {
  it.each(Object.values(SOCIAL_URLS))('remove %s duplicado do texto', (url) => {
    expect(stripEmbeddedSocialUrls(`legenda\n${url}`, [url])).toBe('legenda')
  })

  it('remove URL sem protocolo quando midia tem https', () => {
    expect(
      stripEmbeddedSocialUrls('youtube.com/watch?v=O_rzxRdKgkU', [
        'https://youtube.com/watch?v=O_rzxRdKgkU',
      ]),
    ).toBe('')
  })
})

describe('classifyMedia — todas as redes', () => {
  it.each(Object.values(SOCIAL_URLS))('classifica %s como embed', (url) => {
    expect(classifyMedia([url])).toEqual({ media: [], embeds: [url] })
  })
})

describe('midiasComEmbedDoTexto', () => {
  it('respeita limite máximo', () => {
    const imgs = Array.from({ length: 10 }, (_, i) => `https://res.cloudinary.com/x/${i}.jpg`)
    expect(midiasComEmbedDoTexto(SOCIAL_URLS.youtube, imgs, 10)).toHaveLength(10)
  })
})

describe('midiasAposEditarConteudo', () => {
  it('troca embed social antigo pelo novo do texto', () => {
    expect(
      midiasAposEditarConteudo(SOCIAL_URLS.tiktok, [
        'https://res.cloudinary.com/x/foto.jpg',
        SOCIAL_URLS.instagram,
      ]),
    ).toEqual(['https://res.cloudinary.com/x/foto.jpg', SOCIAL_URLS.tiktok])
  })
})

describe('youTubeId', () => {
  it.each([
    [SOCIAL_URLS.youtube, 'O_rzxRdKgkU'],
    [SOCIAL_URLS.youtubeShort, 'O_rzxRdKgkU'],
    [SOCIAL_URLS.youtubeMobile, 'O_rzxRdKgkU'],
    [SOCIAL_URLS.youtubeShortLink, 'O_rzxRdKgkU'],
  ])('extrai id de %s', (url, id) => {
    expect(youTubeId(url)).toBe(id)
  })
})

describe('embedSupportsColorScheme', () => {
  it('só o X/Twitter aceita tema light/dark no widget oficial', () => {
    expect(embedSupportsColorScheme('twitter')).toBe(true)
    expect(embedSupportsColorScheme('instagram')).toBe(false)
    expect(embedSupportsColorScheme('tiktok')).toBe(false)
    expect(embedSupportsColorScheme('youtube')).toBe(false)
  })
})

describe('twitterStatusId e twitterEmbedSrc', () => {
  it.each([SOCIAL_URLS.twitter, SOCIAL_URLS.x, SOCIAL_URLS.xMobile])('extrai status de %s', (url) => {
    expect(twitterStatusId(url)).toBe('1234567890123456789')
    expect(twitterEmbedSrc(url)).toContain('id=1234567890123456789')
    expect(twitterEmbedSrc(url)).toContain('theme=light')
    expect(twitterEmbedSrc(url, undefined, 'dark')).toContain('theme=dark')
  })
})

describe('instagramEmbedSrc', () => {
  it('monta src de reel com wp nativo', () => {
    expect(instagramEmbedSrc(SOCIAL_URLS.instagram)).toBe(
      'https://www.instagram.com/reel/DSf2dEMDhNa/embed/?cr=1&v=14&wp=540',
    )
  })

  it('monta src de post', () => {
    expect(instagramEmbedSrc(SOCIAL_URLS.instagramPost)).toBe(
      'https://www.instagram.com/p/ABC123xyz/embed/?cr=1&v=14&wp=540',
    )
  })

  it('aceita username no path e share/', () => {
    expect(instagramEmbedSrc('https://www.instagram.com/baixada/p/ABC123xyz/?igsh=1')).toBe(
      'https://www.instagram.com/p/ABC123xyz/embed/?cr=1&v=14&wp=540',
    )
    expect(instagramEmbedSrc('https://www.instagram.com/share/reel/DSf2dEMDhNa/')).toBe(
      'https://www.instagram.com/reel/DSf2dEMDhNa/embed/?cr=1&v=14&wp=540',
    )
  })

  it('rejeita perfil sem post', () => {
    expect(instagramEmbedSrc('https://www.instagram.com/baixada/')).toBeNull()
  })
})

describe('resolveEmbedFrameWidth', () => {
  it('limita TikTok/IG/X à largura nativa do player', () => {
    expect(resolveEmbedFrameWidth('tiktok', 520)).toBe(325)
    expect(resolveEmbedFrameWidth('instagram', 700)).toBe(540)
    expect(resolveEmbedFrameWidth('twitter', 700)).toBe(550)
  })

  it('YouTube usa largura do card', () => {
    expect(resolveEmbedFrameWidth('youtube', 640)).toBe(640)
  })
})

describe('tiktokVideoId', () => {
  it('extrai id do path /video/', () => {
    expect(tiktokVideoId(SOCIAL_URLS.tiktok)).toBe('1234567890123456789')
  })
})

describe('parseEmbedHeightMessage', () => {
  it('lê height do TikTok', () => {
    expect(parseEmbedHeightMessage('tiktok', { height: 978, width: 325 })).toEqual({
      height: 978,
      width: 325,
    })
  })

  it('lê MEASURE do Instagram (objeto e JSON string)', () => {
    expect(
      parseEmbedHeightMessage('instagram', { type: 'MEASURE', details: { height: 1104 } }),
    ).toEqual({ height: 1104 })
    expect(
      parseEmbedHeightMessage(
        'instagram',
        JSON.stringify({ type: 'MEASURE', details: { height: '988' } }),
      ),
    ).toEqual({ height: 988 })
  })
})

describe('applyEmbedHeightReport', () => {
  it('aplica buffer sem upscale', () => {
    expect(applyEmbedHeightReport({ height: 740, width: 325 })).toBe(744)
  })
})

describe('instagramPermalink', () => {
  it('normaliza username/share para permalink canônico', () => {
    expect(instagramPermalink('https://www.instagram.com/baixada/p/ABC123xyz/?igsh=1')).toBe(
      'https://www.instagram.com/p/ABC123xyz/',
    )
    expect(instagramPermalink(SOCIAL_URLS.instagram)).toBe(
      'https://www.instagram.com/reel/DSf2dEMDhNa/',
    )
  })
})
