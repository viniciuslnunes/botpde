import { describe, it, expect } from 'vitest'
import {
  calcularTotaisVenda,
  aplicarDesconto,
  resumirVenda,
  recalcularCustoMedio,
  VendaBarSchema,
  ProdutoBarSchema,
} from '@torcida/types'

describe('bar — totais da venda', () => {
  it('soma itens com arredondamento a 2 casas', () => {
    const { subtotal } = calcularTotaisVenda([
      { precoUnit: 5.5, quantidade: 2 },
      { precoUnit: 3.33, quantidade: 3 },
    ])
    expect(subtotal).toBe(20.99)
  })

  it('retorna subtotal 0 para lista vazia', () => {
    expect(calcularTotaisVenda([]).subtotal).toBe(0)
  })

  it('aplica desconto sem deixar total negativo', () => {
    expect(aplicarDesconto(30, 10)).toBe(20)
    expect(aplicarDesconto(30, 50)).toBe(0)
  })

  it('resume venda com subtotal, desconto e total', () => {
    const r = resumirVenda([{ precoUnit: 10, quantidade: 3 }], 5)
    expect(r).toEqual({ subtotal: 30, desconto: 5, total: 25 })
  })

  it('resume venda com desconto maior que subtotal → total 0', () => {
    const r = resumirVenda([{ precoUnit: 4, quantidade: 1 }], 10)
    expect(r.total).toBe(0)
  })

  it('ignora desconto negativo', () => {
    const r = resumirVenda([{ precoUnit: 10, quantidade: 1 }], -5)
    expect(r).toEqual({ subtotal: 10, desconto: 0, total: 10 })
  })
})

describe('bar — custo médio ponderado', () => {
  it('calcula média ponderada entre estoque atual e entrada', () => {
    // 10 un a R$2 + entrada de 10 un por R$30 → (20 + 30) / 20 = 2.50
    expect(
      recalcularCustoMedio({
        estoqueAtual: 10,
        custoMedioAtual: 2,
        quantidadeEntrada: 10,
        custoTotalEntrada: 30,
      }),
    ).toBe(2.5)
  })

  it('com estoque inicial 0 usa só o custo da entrada', () => {
    expect(
      recalcularCustoMedio({
        estoqueAtual: 0,
        custoMedioAtual: 0,
        quantidadeEntrada: 4,
        custoTotalEntrada: 10,
      }),
    ).toBe(2.5)
  })

  it('retorna 0 quando não há estoque nem entrada', () => {
    expect(
      recalcularCustoMedio({
        estoqueAtual: 0,
        custoMedioAtual: 0,
        quantidadeEntrada: 0,
        custoTotalEntrada: 50,
      }),
    ).toBe(0)
  })

  it('arredonda a 2 casas', () => {
    // (3*1 + 1) / 6 = 0.666... → 0.67
    expect(
      recalcularCustoMedio({
        estoqueAtual: 3,
        custoMedioAtual: 1,
        quantidadeEntrada: 3,
        custoTotalEntrada: 1,
      }),
    ).toBe(0.67)
  })
})

describe('bar — schemas', () => {
  it('rejeita venda sem itens', () => {
    const r = VendaBarSchema.safeParse({ itens: [], metodoPagamento: 'PIX' })
    expect(r.success).toBe(false)
  })

  it('aceita venda válida e aplica default de desconto', () => {
    const r = VendaBarSchema.safeParse({
      itens: [{ produtoId: '4c9c1f9e-8f7a-4b2e-9c5d-1a2b3c4d5e6f', quantidade: '2' }],
      metodoPagamento: 'DINHEIRO',
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.desconto).toBe(0)
      expect(r.data.itens[0].quantidade).toBe(2)
    }
  })

  it('normaliza categoriaId vazia para null no produto', () => {
    const r = ProdutoBarSchema.safeParse({
      nome: 'Cerveja lata',
      preco: '6.50',
      estoque: '24',
      categoriaId: '',
    })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.categoriaId).toBeNull()
  })

  it('rejeita preço zero ou negativo', () => {
    const r = ProdutoBarSchema.safeParse({ nome: 'Água', preco: 0, estoque: 10 })
    expect(r.success).toBe(false)
  })
})
