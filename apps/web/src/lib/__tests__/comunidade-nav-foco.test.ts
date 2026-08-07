import { describe, expect, it } from 'vitest'
import { isComunidadeFeedPath, isComunidadeNavActive } from '../comunidade-nav'

describe('isComunidadeFeedPath', () => {
  it('feed raiz e mural de canal', () => {
    expect(isComunidadeFeedPath('/portal/comunidade')).toBe(true)
    expect(isComunidadeFeedPath('/portal/comunidade/canais/abc')).toBe(true)
    expect(isComunidadeFeedPath('/portal/comunidade/canais')).toBe(false)
    expect(isComunidadeFeedPath('/portal/comunidade/grupos')).toBe(false)
  })
})

describe('isComunidadeNavActive', () => {
  it('Feed ativo no mural do canal; Canais só na listagem', () => {
    expect(isComunidadeNavActive('/portal/comunidade/canais/xyz', '/portal/comunidade')).toBe(true)
    expect(isComunidadeNavActive('/portal/comunidade/canais/xyz', '/portal/comunidade/canais')).toBe(
      false,
    )
    expect(isComunidadeNavActive('/portal/comunidade/canais', '/portal/comunidade/canais')).toBe(true)
    expect(isComunidadeNavActive('/portal/comunidade/grupos', '/portal/comunidade/grupos')).toBe(true)
    expect(
      isComunidadeNavActive('/portal/comunidade/grupos/abc', '/portal/comunidade/grupos'),
    ).toBe(true)
  })
})
