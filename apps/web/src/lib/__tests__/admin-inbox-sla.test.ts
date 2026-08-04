import { describe, expect, it } from 'vitest'
import { slaLabel } from '@/lib/admin-inbox'

describe('slaLabel', () => {
  const agora = new Date('2026-08-04T12:00:00.000Z')

  it('idade: horas e D+N', () => {
    expect(slaLabel(new Date('2026-08-04T11:30:00.000Z'), { agora, modo: 'idade' })).toBe(
      'agora',
    )
    expect(slaLabel(new Date('2026-08-04T09:00:00.000Z'), { agora, modo: 'idade' })).toBe(
      'há 3h',
    )
    expect(slaLabel(new Date('2026-08-01T12:00:00.000Z'), { agora, modo: 'idade' })).toBe(
      'D+3',
    )
  })

  it('ate: horas e dias', () => {
    expect(slaLabel(new Date('2026-08-04T15:00:00.000Z'), { agora, modo: 'ate' })).toBe(
      'em 3h',
    )
    expect(slaLabel(new Date('2026-08-07T12:00:00.000Z'), { agora, modo: 'ate' })).toBe(
      'em 3d',
    )
  })

  it('auto escolhe futuro ou idade', () => {
    expect(slaLabel(new Date('2026-08-04T18:00:00.000Z'), { agora })).toBe('em 6h')
    expect(slaLabel(new Date('2026-08-02T12:00:00.000Z'), { agora })).toBe('D+2')
  })
})
