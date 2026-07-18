import { describe, expect, it } from 'vitest'
import {
  dayKeyInZone,
  formatMonthYear,
  formatTimeShort,
  formatWeekdayLong,
  parseDateOnly,
  startOfWeekMonday,
  startOfZonedDayUtc,
} from '../format-datetime'

describe('format-datetime agenda helpers', () => {
  it('formatTimeShort usa America/Sao_Paulo', () => {
    // 22:00 UTC = 19:00 em São Paulo
    expect(formatTimeShort('2026-07-18T22:00:00.000Z')).toBe('19:00')
  })

  it('dayKeyInZone agrupa pelo dia civil em SP', () => {
    // 02:30 UTC de 19/jul = 23:30 de 18/jul em SP
    expect(dayKeyInZone('2026-07-19T02:30:00.000Z')).toBe('2026-6-18')
  })

  it('parseDateOnly não trata YYYY-MM-DD como UTC midnight', () => {
    expect(parseDateOnly('2026-07-18')).toEqual({ year: 2026, month: 7, day: 18 })
  })

  it('formatMonthYear e weekday são determinísticos', () => {
    expect(formatMonthYear({ year: 2026, month: 7, day: 18 })).toBe('julho de 2026')
    expect(formatWeekdayLong({ year: 2026, month: 7, day: 18 })).toBe(
      'sábado, 18 de julho',
    )
  })

  it('startOfWeekMonday começa na segunda', () => {
    expect(startOfWeekMonday({ year: 2026, month: 7, day: 18 })).toEqual({
      year: 2026,
      month: 7,
      day: 13,
    })
  })

  it('startOfZonedDayUtc é meia-noite SP (UTC−3)', () => {
    expect(startOfZonedDayUtc({ year: 2026, month: 7, day: 18 }).toISOString()).toBe(
      '2026-07-18T03:00:00.000Z',
    )
  })
})
