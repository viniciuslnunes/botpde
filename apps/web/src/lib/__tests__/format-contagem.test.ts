import { describe, expect, it } from 'vitest'
import {
  formatContagem,
  formatTorcedoresEstimados,
  formatTotalComOnline,
} from '@/lib/format-contagem'

describe('formatContagem', () => {
  it('formata milhões', () => {
    expect(formatContagem(42_665_518)).toBe('42,7 mi')
    expect(formatContagem(30_000_000)).toBe('30 mi')
  })

  it('formata milhares', () => {
    expect(formatContagem(1_200)).toBe('1,2 mil')
    expect(formatContagem(15_000)).toBe('15 mil')
  })

  it('formata números pequenos', () => {
    expect(formatContagem(142)).toBe('142')
    expect(formatContagem(0)).toBe('0')
  })
})

describe('formatTorcedoresEstimados', () => {
  it('formata inscritos IBOPE', () => {
    expect(formatTorcedoresEstimados(30_000_000, 'IBOPE_DIGITAL')).toBe('30 mi inscritos digitais')
  })

  it('formata contagem real da plataforma', () => {
    expect(formatTorcedoresEstimados(142, 'PLATAFORMA')).toBe('142 torcedores na plataforma')
  })

  it('formata limite conservador dinâmico', () => {
    expect(formatTorcedoresEstimados(2_000, 'LIMITE_ATE')).toBe('até 2 mil torcedores ou menos')
  })

  it('fallback legado com til', () => {
    expect(formatTorcedoresEstimados(30_000_000)).toBe('~30 mi torcedores')
  })
})

describe('formatTotalComOnline', () => {
  it('mostra online quando > 0', () => {
    expect(formatTotalComOnline(142, 12)).toBe('142 · 12 online')
  })

  it('omite online quando zero', () => {
    expect(formatTotalComOnline(142, 0)).toBe('142')
  })
})
