import { describe, expect, it } from 'vitest'
import {
  podeVerConteudoSocialSync,
  resolverAvatarSocial,
} from '@/lib/perfil-social'

describe('resolverAvatarSocial', () => {
  it('prioriza avatar do perfil social', () => {
    expect(resolverAvatarSocial('https://perfil.jpg', 'https://oauth.jpg')).toBe(
      'https://perfil.jpg',
    )
  })

  it('usa fallback OAuth quando perfil não tem avatar', () => {
    expect(resolverAvatarSocial(null, 'https://oauth.jpg')).toBe('https://oauth.jpg')
  })
})

describe('podeVerConteudoSocialSync', () => {
  const autor = 'autor-1'
  const viewer = 'viewer-1'

  it('permite ao próprio autor', () => {
    expect(podeVerConteudoSocialSync(autor, autor, true, false)).toBe(true)
  })

  it('nega visitante anônimo', () => {
    expect(podeVerConteudoSocialSync(undefined, autor, false, false)).toBe(false)
  })

  it('permite perfil público sem follow', () => {
    expect(podeVerConteudoSocialSync(viewer, autor, false, false)).toBe(true)
  })

  it('nega perfil privado sem follow', () => {
    expect(podeVerConteudoSocialSync(viewer, autor, true, false)).toBe(false)
  })

  it('permite perfil privado com follow aprovado', () => {
    expect(podeVerConteudoSocialSync(viewer, autor, true, true)).toBe(true)
  })
})

describe('feed privacidade — regra de sugestões', () => {
  it('autor privado fora da rede não deve ser visível para não-seguidor', () => {
    const viewer = 'v1'
    const autorPrivado = 'a1'
    const podeVer = podeVerConteudoSocialSync(viewer, autorPrivado, true, false)
    expect(podeVer).toBe(false)
  })
})
