import { describe, expect, it, vi, beforeEach } from 'vitest'

const afiliacaoFindUnique = vi.hoisted(() => vi.fn())
const afiliacaoFindMany = vi.hoisted(() => vi.fn())
const tenantFindMany = vi.hoisted(() => vi.fn())
const saasMembroFindMany = vi.hoisted(() => vi.fn())

vi.mock('@/lib/tenant', () => ({
  torcidaAcessivelNoHost: () => true,
}))

vi.mock('@torcida/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@torcida/db')>()
  return {
    ...actual,
    db: {
      afiliacao: {
        findUnique: afiliacaoFindUnique,
        findMany: afiliacaoFindMany,
      },
      tenant: { findMany: tenantFindMany },
      saasMembro: { findMany: saasMembroFindMany },
    },
  }
})

describe('getTorcidasPorAfiliacao', () => {
  beforeEach(() => {
    vi.resetModules()
    afiliacaoFindUnique.mockReset()
    afiliacaoFindMany.mockReset()
    tenantFindMany.mockReset()
    saasMembroFindMany.mockReset()
    afiliacaoFindUnique.mockResolvedValue({ nome: 'Corinthians (SP)', estado: 'SP' })
    afiliacaoFindMany.mockResolvedValue([{ id: 'af-1', nome: 'Corinthians (SP)', estado: 'SP' }])
    saasMembroFindMany.mockResolvedValue([])
  })

  it('ordena torcidas por membros decrescente, com logo antes de sem logo', async () => {
    tenantFindMany.mockResolvedValue([
      {
        id: 't-sem-logo',
        nome: 'Estopim da Fiel',
        slug: 'estopim',
        logoUrl: null,
        corPrimaria: '#000',
        torcidaConhecidaId: null,
        torcidaConhecida: null,
        _count: { membros: 10 },
        sedes: [],
      },
      {
        id: 't-com-logo',
        nome: 'Gaviões',
        slug: 'gavioes',
        logoUrl: 'https://res.cloudinary.com/demo/gavioes.png',
        corPrimaria: '#111',
        torcidaConhecidaId: null,
        torcidaConhecida: null,
        _count: { membros: 2 },
        sedes: [],
      },
    ])

    saasMembroFindMany.mockResolvedValue([
      {
        userId: 'u1',
        tipo: 'SOCIO',
        tenantId: 't-sem-logo',
        user: { ultimoAcessoEm: null },
      },
      {
        userId: 'u2',
        tipo: 'SOCIO',
        tenantId: 't-sem-logo',
        user: { ultimoAcessoEm: null },
      },
      {
        userId: 'u3',
        tipo: 'TORCEDOR',
        tenantId: 't-com-logo',
        user: { ultimoAcessoEm: null },
      },
    ])

    const { getTorcidasPorAfiliacao } = await import('@/lib/onboarding')
    const lista = await getTorcidasPorAfiliacao('af-1')

    expect(lista.map((t) => t.id)).toEqual(['t-com-logo', 't-sem-logo'])
    expect(lista[0]?.stats.torcedoresTotal).toBe(1)
    expect(lista[1]?.stats.sociosTotal).toBe(2)
  })

  it('expõe stats vazias quando não há membros', async () => {
    tenantFindMany.mockResolvedValue([
      {
        id: 't-vazia',
        nome: 'Coringão Chopp',
        slug: 'coringao-chopp',
        logoUrl: 'https://res.cloudinary.com/demo/chopp.png',
        corPrimaria: '#222',
        torcidaConhecidaId: null,
        torcidaConhecida: null,
        _count: { membros: 0 },
        sedes: [],
      },
    ])

    const { getTorcidasPorAfiliacao } = await import('@/lib/onboarding')
    const lista = await getTorcidasPorAfiliacao('af-1')

    expect(lista).toHaveLength(1)
    expect(lista[0]?.stats).toEqual({
      sociosTotal: 0,
      sociosOnline: 0,
      torcedoresTotal: 0,
      torcedoresOnline: 0,
    })
  })
})
