import { describe, expect, it } from 'vitest'
import {
  podeVerConteudoSocialSync,
  resolverAvatarSocial,
  resolverPerfilPrivadoEfetivo,
  torcedorAprovadoPublicoObrigatorio,
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

describe('resolverPerfilPrivadoEfetivo', () => {
  it('sócio aprovado respeita preferência gravada (default privado)', () => {
    expect(
      resolverPerfilPrivadoEfetivo(true, { tipo: 'SOCIO', status: 'APROVADO' }),
    ).toBe(true)
    expect(
      resolverPerfilPrivadoEfetivo(false, { tipo: 'SOCIO', status: 'APROVADO' }),
    ).toBe(false)
    expect(
      resolverPerfilPrivadoEfetivo(undefined, { tipo: 'SOCIO', status: 'APROVADO' }),
    ).toBe(true)
  })

  it('sócio pendente também defaulta privado quando sem preferência', () => {
    expect(
      resolverPerfilPrivadoEfetivo(undefined, { tipo: 'SOCIO', status: 'PENDENTE' }),
    ).toBe(true)
    expect(
      resolverPerfilPrivadoEfetivo(false, { tipo: 'SOCIO', status: 'PENDENTE' }),
    ).toBe(false)
  })

  it('torcedor é sempre público', () => {
    expect(
      resolverPerfilPrivadoEfetivo(false, { tipo: 'TORCEDOR', status: 'APROVADO' }),
    ).toBe(false)
    expect(
      resolverPerfilPrivadoEfetivo(true, { tipo: 'TORCEDOR', status: 'APROVADO' }),
    ).toBe(false)
    expect(
      resolverPerfilPrivadoEfetivo(true, { tipo: 'TORCEDOR', status: 'PENDENTE' }),
    ).toBe(false)
  })

  it('sem vínculo assume público', () => {
    expect(resolverPerfilPrivadoEfetivo(undefined, null)).toBe(false)
  })
})

describe('torcedorAprovadoPublicoObrigatorio', () => {
  it('identifica torcedor aprovado', () => {
    expect(
      torcedorAprovadoPublicoObrigatorio({ tipo: 'TORCEDOR', status: 'APROVADO' }),
    ).toBe(true)
    expect(
      torcedorAprovadoPublicoObrigatorio({ tipo: 'TORCEDOR', status: 'PENDENTE' }),
    ).toBe(true)
    expect(
      torcedorAprovadoPublicoObrigatorio({ tipo: 'SOCIO', status: 'APROVADO' }),
    ).toBe(false)
    expect(torcedorAprovadoPublicoObrigatorio(null)).toBe(false)
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
