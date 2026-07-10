import { describe, expect, it } from 'vitest'
import { reviveDate } from '@/lib/comunidade'

describe('reviveDate', () => {
  it('preserva instância Date', () => {
    const d = new Date('2026-07-10T12:00:00.000Z')
    expect(reviveDate(d)).toBe(d)
  })

  it('converte string ISO do unstable_cache em Date', () => {
    const iso = '2026-07-10T12:00:00.000Z'
    const revived = reviveDate(iso)
    expect(revived).toBeInstanceOf(Date)
    expect(revived.toISOString()).toBe(iso)
  })
})
