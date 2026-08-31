import { describe, expect, it } from 'vitest'
import {
  CriarPatrimonioItemSchema,
  AtualizarPatrimonioItemSchema,
  FiltroPatrimonioSchema,
} from '@torcida/types'
import { parseAcervoTab } from '@/lib/acervo-tab'
import {
  categoriaDoEventoInventario,
  eventoInventarioNoEscopo,
} from '@/lib/patrimonio-auditoria'

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

  it('bandeira na criação aceita N peças; na edição exige peça única', () => {
    const bandeira = { ...base, categoria: 'BANDEIRA', quantidade: '11' }
    const criar = CriarPatrimonioItemSchema.safeParse(bandeira)
    expect(criar.success).toBe(true)
    if (criar.success) expect(criar.data.quantidade).toBe(11)

    expect(
      CriarPatrimonioItemSchema.safeParse({ ...bandeira, quantidade: '51' }).success,
    ).toBe(false)

    expect(
      AtualizarPatrimonioItemSchema.safeParse({
        ...bandeira,
        id: '550e8400-e29b-41d4-a716-446655440000',
      }).success,
    ).toBe(false)
    expect(
      AtualizarPatrimonioItemSchema.safeParse({
        ...bandeira,
        quantidade: '1',
        id: '550e8400-e29b-41d4-a716-446655440000',
      }).success,
    ).toBe(true)
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

  it('aceita fotoUrl e trata vazio como ausente', () => {
    const parsed = CriarPatrimonioItemSchema.safeParse({
      ...base,
      fotoUrl: 'https://res.cloudinary.com/demo/image/upload/v1/surdo.jpg',
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.fotoUrl).toContain('cloudinary')

    const vazio = CriarPatrimonioItemSchema.safeParse({ ...base, fotoUrl: '' })
    expect(vazio.success).toBe(true)
    if (vazio.success) expect(vazio.data.fotoUrl).toBeUndefined()
  })

  it('rejeita fotoUrl que não é URL', () => {
    expect(CriarPatrimonioItemSchema.safeParse({ ...base, fotoUrl: 'nao-e-url' }).success).toBe(
      false,
    )
  })

  it('filtro inclui baixados', () => {
    const parsed = FiltroPatrimonioSchema.safeParse({ incluirBaixados: '1', page: '1' })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.incluirBaixados).toBe(true)
  })
})

describe('parseAcervoTab', () => {
  const tabs = ['acervo', 'em-uso', 'pendencias', 'historico'] as const

  it('aceita tab declarada e cai no default fora da lista', () => {
    expect(parseAcervoTab('historico', tabs, 'acervo')).toBe('historico')
    expect(parseAcervoTab('em-uso', tabs, 'acervo')).toBe('em-uso')
    expect(parseAcervoTab('invalida', tabs, 'acervo')).toBe('acervo')
    expect(parseAcervoTab(undefined, tabs, 'acervo')).toBe('acervo')
  })
})

describe('auditoria de inventário — recorte por departamento', () => {
  it('usa categoria do log e cai no item ainda existente', () => {
    expect(categoriaDoEventoInventario({ categoria: 'BANDEIRA' })).toBe('BANDEIRA')
    expect(categoriaDoEventoInventario({ nome: 'Surdo' }, 'INSTRUMENTO')).toBe('INSTRUMENTO')
    expect(categoriaDoEventoInventario({})).toBeNull()
    expect(eventoInventarioNoEscopo('BANDEIRA', 'BANDEIRA')).toBe(true)
    expect(eventoInventarioNoEscopo('INSTRUMENTO', 'BANDEIRA')).toBe(false)
    expect(eventoInventarioNoEscopo('BANDEIRA', null)).toBe(true)
    expect(eventoInventarioNoEscopo(null, 'BANDEIRA')).toBe(false)
    expect(eventoInventarioNoEscopo(null, null)).toBe(true)
  })
})
