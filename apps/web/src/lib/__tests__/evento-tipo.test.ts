import { describe, expect, it } from 'vitest'
import { CriarEventoSchema, TipoEventoSchema, TIPO_EVENTO_LABEL } from '@torcida/types'

describe('evento tipo', () => {
  it('enum e labels cobrem os três tipos', () => {
    expect(TipoEventoSchema.parse('CARAVANA')).toBe('CARAVANA')
    expect(TipoEventoSchema.parse('ENSAIO')).toBe('ENSAIO')
    expect(TIPO_EVENTO_LABEL.CARAVANA).toMatch(/Caravana/i)
    expect(TIPO_EVENTO_LABEL.ENSAIO).toMatch(/Ensaio/i)
  })

  it('criar evento aceita tipo com default GERAL', () => {
    const parsed = CriarEventoSchema.safeParse({
      titulo: 'Amistoso na sede',
      data: '2026-08-01T12:00',
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.tipo).toBe('GERAL')
  })

  it('criar caravana exige tipo CARAVANA', () => {
    const parsed = CriarEventoSchema.safeParse({
      titulo: 'Busão pra Arena',
      data: '2026-08-10T08:00',
      tipo: 'CARAVANA',
      local: 'Sede — portão',
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.tipo).toBe('CARAVANA')
  })
})
