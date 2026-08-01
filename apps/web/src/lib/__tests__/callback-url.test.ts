import { describe, expect, it } from 'vitest'
import { destinoInternoSeguro } from '@/lib/callback-url'

/**
 * O `callbackUrl` chega de um link colado por terceiros (convite de unidade) e
 * atravessa login, cadastro e a tela de apelido. É superfície de open redirect —
 * daí o teste ser explícito sobre o que NÃO passa.
 */
describe('destinoInternoSeguro', () => {
  it('aceita caminho interno relativo', () => {
    expect(destinoInternoSeguro('/convite/abc123')).toBe('/convite/abc123')
    expect(destinoInternoSeguro('/onboarding?convite=abc')).toBe('/onboarding?convite=abc')
  })

  it('apara espaços em volta', () => {
    expect(destinoInternoSeguro('  /convite/abc  ')).toBe('/convite/abc')
  })

  it('recusa URL absoluta', () => {
    expect(destinoInternoSeguro('https://evil.example/phish')).toBeNull()
    expect(destinoInternoSeguro('http://evil.example')).toBeNull()
  })

  it('recusa as formas protocol-relative que o navegador trata como absolutas', () => {
    expect(destinoInternoSeguro('//evil.example/phish')).toBeNull()
    expect(destinoInternoSeguro('/\\evil.example')).toBeNull()
  })

  it('recusa valor ausente ou de tipo errado', () => {
    expect(destinoInternoSeguro(undefined)).toBeNull()
    expect(destinoInternoSeguro(null)).toBeNull()
    expect(destinoInternoSeguro('')).toBeNull()
    expect(destinoInternoSeguro(42)).toBeNull()
    expect(destinoInternoSeguro('onboarding')).toBeNull()
  })
})
