import { describe, expect, it } from 'vitest'
import { expandirCoirmasNoFeed } from '@/lib/feed-coirmas'

describe('expandirCoirmasNoFeed', () => {
  it('sócio aprovado não vê coirmãs — malha desta torcida', () => {
    expect(
      expandirCoirmasNoFeed({
        membroAprovado: true,
        tenantSintetico: false,
        superAdmin: false,
      }),
    ).toBe(false)
  })

  it('torcedor sem vínculo no tenant real vê coirmãs do clube (praça)', () => {
    expect(
      expandirCoirmasNoFeed({
        membroAprovado: false,
        tenantSintetico: false,
        superAdmin: false,
      }),
    ).toBe(true)
  })

  it('CN (sintético): coirmãs da afiliação são o escopo, inclusive operador', () => {
    expect(
      expandirCoirmasNoFeed({
        membroAprovado: false,
        tenantSintetico: true,
        superAdmin: true,
      }),
    ).toBe(true)
    expect(
      expandirCoirmasNoFeed({
        membroAprovado: false,
        tenantSintetico: true,
        superAdmin: false,
      }),
    ).toBe(true)
  })

  it('operador numa TO real não expande coirmãs — não vaza Camisa 12 no mural da PDE', () => {
    expect(
      expandirCoirmasNoFeed({
        membroAprovado: false,
        tenantSintetico: false,
        superAdmin: true,
      }),
    ).toBe(false)
  })
})
