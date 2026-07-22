import { describe, expect, it } from 'vitest'
import {
  podeVerConteudoSocialSync,
  resolverAvatarSocial,
  resolverPerfilPrivadoEfetivo,
  resolverTituloPerfilSocial,
  torcedorAprovadoPublicoObrigatorio,
} from '@/lib/perfil-social'

describe('resolverAvatarSocial', () => {
  it('retorna o avatar do usuário', () => {
    expect(resolverAvatarSocial('https://oauth.jpg')).toBe('https://oauth.jpg')
  })

  it('retorna null quando o usuário não tem avatar', () => {
    expect(resolverAvatarSocial(null)).toBe(null)
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

describe('resolverTituloPerfilSocial', () => {
  it('torcedor exibe apelido do clube', () => {
    expect(
      resolverTituloPerfilSocial({
        tipoMembro: 'TORCEDOR',
        tenantNome: 'GAVIÕES DA FIEL',
        afiliacaoApelido: 'Timão',
        afiliacaoNome: 'Corinthians',
      }),
    ).toBe('Timão')
  })

  it('torcedor sem apelido cai no nome do clube', () => {
    expect(
      resolverTituloPerfilSocial({
        tipoMembro: 'TORCEDOR',
        tenantNome: 'GAVIÕES DA FIEL',
        afiliacaoApelido: null,
        afiliacaoNome: 'Corinthians',
      }),
    ).toBe('Corinthians')
  })

  it('sócio exibe nome da torcida organizada', () => {
    expect(
      resolverTituloPerfilSocial({
        tipoMembro: 'SOCIO',
        tenantNome: 'GAVIÕES DA FIEL',
        afiliacaoApelido: 'Timão',
        afiliacaoNome: 'Corinthians',
      }),
    ).toBe('GAVIÕES DA FIEL')
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
