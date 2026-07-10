import { describe, it, expect } from 'vitest'
import { validarCupom, calcularDesconto, chaveTamanho, percentualDesconto, ordenarTamanhos } from '@torcida/types'

describe('loja — cupom', () => {
  const cupom10 = { tipo: 'PERCENTUAL' as const, valor: 10, ativo: true, primeiraCompra: true, validoAte: null }

  it('rejeita cupom inativo', () => {
    expect(validarCupom({ ...cupom10, ativo: false }, { subtotal: 100, userJaComprou: false }).ok).toBe(false)
  })

  it('rejeita cupom expirado', () => {
    const r = validarCupom(
      { ...cupom10, validoAte: new Date('2020-01-01') },
      { subtotal: 100, userJaComprou: false, agora: new Date('2026-01-01') },
    )
    expect(r.ok).toBe(false)
  })

  it('rejeita primeira compra se usuário já comprou', () => {
    const r = validarCupom(cupom10, { subtotal: 100, userJaComprou: true })
    expect(r.ok).toBe(false)
    expect(r.erro).toMatch(/primeira compra/i)
  })

  it('calcula desconto percentual', () => {
    expect(calcularDesconto(cupom10, 200)).toBe(20)
  })

  it('calcula desconto fixo sem ultrapassar subtotal', () => {
    expect(calcularDesconto({ tipo: 'FIXO', valor: 50 }, 30)).toBe(30)
  })
})

describe('loja — tamanhos e promo', () => {
  it('normaliza tamanho único', () => {
    expect(chaveTamanho(undefined)).toBe('UN')
    expect(chaveTamanho('M')).toBe('M')
  })

  it('calcula percentual de desconto', () => {
    expect(percentualDesconto(60, 45)).toBe(25)
    expect(percentualDesconto(50, 50)).toBe(0)
  })

  it('ordena tamanhos e ignora UN', () => {
    expect(ordenarTamanhos(['GG', 'UN', 'P', 'M', 'G1'])).toEqual(['P', 'M', 'GG', 'G1'])
  })
})
