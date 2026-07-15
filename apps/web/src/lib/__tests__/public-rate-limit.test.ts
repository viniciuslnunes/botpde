import { describe, expect, it } from 'vitest'
import {
  clientIpFromHeaders,
  excedeuLimitePublico,
  registrarUsoPublico,
} from '../public-rate-limit'

describe('public-rate-limit', () => {
  it('extrai IP de x-forwarded-for (primeiro hop)', () => {
    const headers = new Headers({
      'x-forwarded-for': '203.0.113.10, 10.0.0.1',
    })
    expect(clientIpFromHeaders(headers)).toBe('203.0.113.10')
  })

  it('bloqueia nicknameCheck após esgotar a janela', () => {
    const key = `nick-test-${Date.now()}`
    for (let i = 0; i < 40; i++) {
      expect(excedeuLimitePublico('nicknameCheck', key)).toBe(false)
      registrarUsoPublico('nicknameCheck', key)
    }
    expect(excedeuLimitePublico('nicknameCheck', key)).toBe(true)
  })

  it('escopos isolados — esgotar um não afeta outro', () => {
    const key = `scope-iso-${Date.now()}`
    for (let i = 0; i < 15; i++) registrarUsoPublico('nicknameSuggest', key)
    expect(excedeuLimitePublico('nicknameSuggest', key)).toBe(true)
    expect(excedeuLimitePublico('criarConta', key)).toBe(false)
  })
})
