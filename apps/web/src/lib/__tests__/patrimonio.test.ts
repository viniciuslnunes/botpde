import { describe, expect, it } from 'vitest'
import {
  CriarPatrimonioItemSchema,
  AtualizarPatrimonioItemSchema,
  FiltroPatrimonioSchema,
} from '@torcida/types'

describe('patrimonio — schemas', () => {
  const base = {
    nome: 'Surdo 22"',
    categoria: 'INSTRUMENTO',
    status: 'DISPONIVEL',
    quantidade: '2',
  }

  it('cria item válido', () => {
    const parsed = CriarPatrimonioItemSchema.safeParse(base)
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.quantidade).toBe(2)
  })

  it('rejeita quantidade zero e nome curto', () => {
    expect(CriarPatrimonioItemSchema.safeParse({ ...base, quantidade: 0 }).success).toBe(false)
    expect(CriarPatrimonioItemSchema.safeParse({ ...base, nome: 'A' }).success).toBe(false)
  })

  it('valor estimado vazio vira undefined', () => {
    const parsed = CriarPatrimonioItemSchema.safeParse({ ...base, valorEstimado: '' })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.valorEstimado).toBeUndefined()
  })

  it('atualiza exige uuid', () => {
    expect(AtualizarPatrimonioItemSchema.safeParse({ ...base, id: 'x' }).success).toBe(false)
    expect(
      AtualizarPatrimonioItemSchema.safeParse({
        ...base,
        id: '550e8400-e29b-41d4-a716-446655440000',
      }).success,
    ).toBe(true)
  })

  it('filtro inclui baixados', () => {
    const parsed = FiltroPatrimonioSchema.safeParse({ incluirBaixados: '1', page: '1' })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.incluirBaixados).toBe(true)
  })
})
