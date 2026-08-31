import { describe, expect, it } from 'vitest'
import { createFetchGeneration } from '@/lib/fetch-generation'

describe('createFetchGeneration', () => {
  it('marca só a geração mais recente como atual', () => {
    const gen = createFetchGeneration()
    const a = gen.next()
    const b = gen.next()
    expect(gen.isCurrent(a)).toBe(false)
    expect(gen.isCurrent(b)).toBe(true)
  })
})
