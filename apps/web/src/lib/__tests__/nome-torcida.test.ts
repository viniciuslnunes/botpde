import { describe, expect, it } from 'vitest'
import { formatNomeTorcida } from '@torcida/types'

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
