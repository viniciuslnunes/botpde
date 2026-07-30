import { describe, expect, it } from 'vitest'
import {
  formatNomeAfiliacao,
  formatNomeTorcida,
  nomeExibicaoAfiliacao,
} from '@torcida/types'

describe('formatNomeTorcida', () => {
  it('converte para caixa alta com locale pt-BR', () => {
    expect(formatNomeTorcida('Gaviões da Fiel')).toBe('GAVIÕES DA FIEL')
    expect(formatNomeTorcida('  camisa 12  ')).toBe('CAMISA 12')
  })

  it('trata valor vazio', () => {
    expect(formatNomeTorcida('')).toBe('')
    expect(formatNomeTorcida(null)).toBe('')
  })
})

describe('formatNomeAfiliacao', () => {
  it('converte clube para caixa alta', () => {
    expect(formatNomeAfiliacao('Corinthians')).toBe('CORINTHIANS')
    expect(formatNomeAfiliacao('São Paulo')).toBe('SÃO PAULO')
  })
})

describe('nomeExibicaoAfiliacao', () => {
  it('prioriza apelido e aplica caixa alta', () => {
    expect(nomeExibicaoAfiliacao({ nome: 'Sport Club Corinthians Paulista', apelido: 'Corinthians' })).toBe(
      'CORINTHIANS',
    )
    expect(nomeExibicaoAfiliacao({ nome: 'Flamengo', apelido: null })).toBe('FLAMENGO')
  })

  it('trata valor vazio', () => {
    expect(nomeExibicaoAfiliacao(null)).toBe('')
    expect(nomeExibicaoAfiliacao(undefined)).toBe('')
  })
})
