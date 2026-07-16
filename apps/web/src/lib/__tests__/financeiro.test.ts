import { describe, expect, it } from 'vitest'
import {
  AtualizarLancamentoSchema,
  CriarLancamentoSchema,
  FiltroFinanceiroSchema,
  formatDataCompetenciaInput,
  parseDataCompetencia,
  validarJanelaCompetencia,
} from '@torcida/types'

describe('financeiro — data de competência', () => {
  it('parseia YYYY-MM-DD no calendário local', () => {
    const d = parseDataCompetencia('2026-03-15')
    expect(d).not.toBeNull()
    expect(d!.getFullYear()).toBe(2026)
    expect(d!.getMonth()).toBe(2)
    expect(d!.getDate()).toBe(15)
    expect(formatDataCompetenciaInput(d!)).toBe('2026-03-15')
  })

  it('rejeita data inválida e janela fora do permitido', () => {
    expect(parseDataCompetencia('2026-13-01')).toBeNull()
    expect(parseDataCompetencia('15/03/2026')).toBeNull()
    const antiga = parseDataCompetencia('1999-12-31')!
    expect(validarJanelaCompetencia(antiga)).toMatch(/2000/)
  })
})

describe('financeiro — schemas', () => {
  const base = {
    tipo: 'RECEITA',
    categoria: 'MENSALIDADE',
    valor: '120.5',
    descricao: 'Mensalidade março',
    data: '2026-03-15',
  }

  it('cria lançamento válido', () => {
    const parsed = CriarLancamentoSchema.safeParse(base)
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.valor).toBe(120.5)
  })

  it('rejeita valor zero e descrição curta', () => {
    expect(CriarLancamentoSchema.safeParse({ ...base, valor: 0 }).success).toBe(false)
    expect(CriarLancamentoSchema.safeParse({ ...base, descricao: 'ab' }).success).toBe(false)
  })

  it('atualiza exige uuid', () => {
    expect(
      AtualizarLancamentoSchema.safeParse({ ...base, id: 'not-a-uuid' }).success,
    ).toBe(false)
    expect(
      AtualizarLancamentoSchema.safeParse({
        ...base,
        id: '550e8400-e29b-41d4-a716-446655440000',
      }).success,
    ).toBe(true)
  })

  it('filtro ignora datas inválidas e pagina', () => {
    const parsed = FiltroFinanceiroSchema.safeParse({
      tipo: 'DESPESA',
      dataDe: 'lixo',
      page: '2',
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.tipo).toBe('DESPESA')
      expect(parsed.data.dataDe).toBeUndefined()
      expect(parsed.data.page).toBe(2)
    }
  })
})
