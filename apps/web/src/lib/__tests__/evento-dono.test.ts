import { describe, it, expect } from 'vitest'
import {
  DONO_VAZIO,
  formatarDonoValor,
  parseDonoValor,
  rotuloDono,
} from '@/lib/evento-dono'

describe('formatarDonoValor', () => {
  it('sem departamento não tem valor — o evento é da torcida', () => {
    expect(formatarDonoValor(null)).toBe('')
    expect(formatarDonoValor(undefined, 'area-1')).toBe('')
  })

  it('departamento inteiro vai sozinho', () => {
    expect(formatarDonoValor('dep-1')).toBe('dep-1')
    expect(formatarDonoValor('dep-1', null)).toBe('dep-1')
  })

  it('frente do departamento vai junto, separada', () => {
    expect(formatarDonoValor('dep-1', 'area-2')).toBe('dep-1::area-2')
  })
})

describe('parseDonoValor', () => {
  it('vazio, nulo e espaço em branco caem no dono vazio', () => {
    expect(parseDonoValor('')).toEqual(DONO_VAZIO)
    expect(parseDonoValor(null)).toEqual(DONO_VAZIO)
    expect(parseDonoValor(undefined)).toEqual(DONO_VAZIO)
    expect(parseDonoValor('   ')).toEqual(DONO_VAZIO)
  })

  it('lê departamento sozinho', () => {
    expect(parseDonoValor('dep-1')).toEqual({ departamentoId: 'dep-1', areaId: null })
  })

  it('lê departamento + frente', () => {
    expect(parseDonoValor('dep-1::area-2')).toEqual({
      departamentoId: 'dep-1',
      areaId: 'area-2',
    })
  })

  it('separador solto não vira área fantasma', () => {
    expect(parseDonoValor('dep-1::')).toEqual({ departamentoId: 'dep-1', areaId: null })
    expect(parseDonoValor('::area-2')).toEqual(DONO_VAZIO)
  })

  it('vai e volta sem perder informação', () => {
    const ida = formatarDonoValor('dep-9', 'area-9')
    expect(parseDonoValor(ida)).toEqual({ departamentoId: 'dep-9', areaId: 'area-9' })
  })
})

describe('rotuloDono', () => {
  it('sem departamento não há rótulo', () => {
    expect(rotuloDono(null)).toBeNull()
    expect(rotuloDono(undefined, 'Escala de jogo')).toBeNull()
  })

  it('mostra a frente quando existe', () => {
    expect(rotuloDono('Bateria')).toBe('Bateria')
    expect(rotuloDono('Bateria', 'Escala de jogo')).toBe('Bateria · Escala de jogo')
  })
})
