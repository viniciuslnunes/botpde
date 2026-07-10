import { describe, expect, it } from 'vitest'
import { calcularExpiraStory } from '../stories'

describe('stories', () => {
  it('calcula expiração em 24h', () => {
    const criado = new Date('2026-07-10T12:00:00.000Z')
    const expira = calcularExpiraStory(criado)
    expect(expira.getTime() - criado.getTime()).toBe(24 * 60 * 60 * 1000)
  })
})
