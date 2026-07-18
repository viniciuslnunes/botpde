import { describe, expect, it } from 'vitest'
import {
  candidatosNicknameOAuth,
  extrairPerfilOAuth,
  seedNicknameDoEmail,
  seedNicknameDoHandle,
} from '@/lib/oauth-perfil'

describe('seedNicknameDoHandle', () => {
  it('aceita username Discord já válido', () => {
    expect(seedNicknameDoHandle('mano_beico')).toBe('mano_beico')
    expect(seedNicknameDoHandle('Fiel1910')).toBe('fiel1910')
  })

  it('sanitiza pontos e hífens do Discord novo', () => {
    expect(seedNicknameDoHandle('mano.beico')).toBe('mano_beico')
  })

  it('rejeita handle curto demais', () => {
    expect(seedNicknameDoHandle('ab')).toBe('')
  })
})

describe('seedNicknameDoEmail', () => {
  it('usa a parte local do e-mail', () => {
    expect(seedNicknameDoEmail('Mano.Beico@gmail.com')).toBe('mano_beico')
  })

  it('retorna vazio sem e-mail', () => {
    expect(seedNicknameDoEmail(null)).toBe('')
  })
})

describe('extrairPerfilOAuth', () => {
  it('Discord: prioriza username no @ e global_name no nome', () => {
    const perfil = extrairPerfilOAuth(
      'discord',
      {
        email: 'mano@example.com',
        name: 'Mano Beiço',
        image: 'https://cdn.discordapp.com/avatars/1/a.png',
      },
      {
        username: 'mano_beico',
        global_name: 'Mano Beiço',
        email: 'mano@example.com',
      },
    )

    expect(perfil.email).toBe('mano@example.com')
    expect(perfil.nome).toBe('Mano Beiço')
    expect(perfil.avatarUrl).toContain('discordapp.com')
    expect(perfil.nicknameSeeds[0]).toBe('mano_beico')
    expect(perfil.nicknameSeeds).toContain('mano_beico')
  })

  it('Discord: cai no username quando não há global_name nem name', () => {
    const perfil = extrairPerfilOAuth(
      'discord',
      { email: null, name: null, image: null },
      { username: 'gaviao_sp' },
    )
    expect(perfil.nome).toBe('gaviao_sp')
    expect(perfil.nicknameSeeds[0]).toBe('gaviao_sp')
  })

  it('Google: nome + seeds a partir de given_name e e-mail', () => {
    const perfil = extrairPerfilOAuth(
      'google',
      {
        email: 'joao.silva@gmail.com',
        name: 'João Silva',
        image: 'https://lh3.googleusercontent.com/a/xxx',
      },
      {
        given_name: 'João',
        family_name: 'Silva',
        email: 'joao.silva@gmail.com',
        picture: 'https://lh3.googleusercontent.com/a/xxx',
      },
    )

    expect(perfil.email).toBe('joao.silva@gmail.com')
    expect(perfil.nome).toBe('João Silva')
    expect(perfil.nicknameSeeds[0]).toBe('joao')
    expect(perfil.nicknameSeeds).toContain('joao_silva')
  })

  it('normaliza e-mail em minúsculas', () => {
    const perfil = extrairPerfilOAuth(
      'google',
      { email: 'Mano@Example.COM', name: 'Mano', image: null },
      {},
    )
    expect(perfil.email).toBe('mano@example.com')
  })
})

describe('candidatosNicknameOAuth', () => {
  it('prioriza seed do provider e inclui variantes', () => {
    const lista = candidatosNicknameOAuth(['mano_beico'], 'Mano Beiço', 'mano@x.com', 8)
    expect(lista[0]).toBe('mano_beico')
    expect(lista.length).toBeGreaterThan(1)
  })
})
