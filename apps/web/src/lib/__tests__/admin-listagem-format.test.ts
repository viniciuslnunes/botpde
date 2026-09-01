import { describe, expect, it } from 'vitest'
import {
  formatCaixaAltaListagem,
  formatTelefoneListagem,
} from '@/lib/admin-listagem-format'

describe('formatTelefoneListagem', () => {
  it('mascara celular e fixo BR', () => {
    expect(formatTelefoneListagem('11910001220')).toBe('(11) 91000-1220')
    expect(formatTelefoneListagem('(11) 90000-0073')).toBe('(11) 90000-0073')
    expect(formatTelefoneListagem('1133334444')).toBe('(11) 3333-4444')
  })

  it('trata vazio', () => {
    expect(formatTelefoneListagem(null)).toBeNull()
    expect(formatTelefoneListagem('')).toBeNull()
    expect(formatTelefoneListagem('  ')).toBeNull()
  })
})

describe('formatCaixaAltaListagem', () => {
  it('converte área, unidade e cidade com locale pt-BR', () => {
    expect(formatCaixaAltaListagem('Materiais / Loja')).toBe('MATERIAIS / LOJA')
    expect(formatCaixaAltaListagem('Ponto de Encontro Taubaté')).toBe(
      'PONTO DE ENCONTRO TAUBATÉ',
    )
    expect(formatCaixaAltaListagem('Nesta unidade')).toBe('NESTA UNIDADE')
    expect(formatCaixaAltaListagem('São Paulo')).toBe('SÃO PAULO')
  })

  it('trata vazio', () => {
    expect(formatCaixaAltaListagem(null)).toBeNull()
    expect(formatCaixaAltaListagem('  ')).toBeNull()
  })
})
