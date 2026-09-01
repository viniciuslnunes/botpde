import { describe, expect, it } from 'vitest'
import {
  hrefCarteirinhaSecao,
  parseCarteirinhaSecao,
} from '../carteirinha-tabs'

describe('parseCarteirinhaSecao', () => {
  it('cai na carteirinha sem query ou com valor desconhecido', () => {
    expect(parseCarteirinhaSecao(undefined)).toBe('carteirinha')
    expect(parseCarteirinhaSecao('')).toBe('carteirinha')
    expect(parseCarteirinhaSecao('nope')).toBe('carteirinha')
    expect(parseCarteirinhaSecao('carteirinha')).toBe('carteirinha')
  })

  it('abre a ficha só com secao=cadastro', () => {
    expect(parseCarteirinhaSecao('cadastro')).toBe('cadastro')
  })

  it('usa o primeiro valor quando Next entrega array', () => {
    expect(parseCarteirinhaSecao(['cadastro', 'carteirinha'])).toBe('cadastro')
  })
})

describe('hrefCarteirinhaSecao', () => {
  it('omite a query na aba padrão e preserva o deep link da ficha', () => {
    expect(hrefCarteirinhaSecao('carteirinha')).toBe('/portal/carteirinha')
    expect(hrefCarteirinhaSecao('cadastro')).toBe('/portal/carteirinha?secao=cadastro')
  })
})
