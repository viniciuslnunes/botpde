import { describe, expect, it, vi, beforeEach } from 'vitest'

const afiliacaoFindUnique = vi.hoisted(() => vi.fn())
const afiliacaoFindMany = vi.hoisted(() => vi.fn())
const tenantFindMany = vi.hoisted(() => vi.fn())
const sedeFindMany = vi.hoisted(() => vi.fn())
const saasMembroFindMany = vi.hoisted(() => vi.fn())
const getAncestorTenantIds = vi.hoisted(() => vi.fn())
const getDescendantTenantIds = vi.hoisted(() => vi.fn())

vi.mock('@/lib/tenant', () => ({
  torcidaAcessivelNoHost: () => true,
}))

vi.mock('@/lib/hierarquia', () => ({
  getAncestorTenantIds: (...args: unknown[]) => getAncestorTenantIds(...args),
  getDescendantTenantIds: (...args: unknown[]) => getDescendantTenantIds(...args),
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
      sede: { findMany: sedeFindMany },
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
    sedeFindMany.mockReset()
    saasMembroFindMany.mockReset()
    getAncestorTenantIds.mockReset()
    getDescendantTenantIds.mockReset()
    afiliacaoFindUnique.mockResolvedValue({ nome: 'Corinthians (SP)', estado: 'SP' })
    afiliacaoFindMany.mockResolvedValue([{ id: 'af-1', nome: 'Corinthians (SP)', estado: 'SP' }])
    saasMembroFindMany.mockResolvedValue([])
    getAncestorTenantIds.mockResolvedValue([])
    getDescendantTenantIds.mockResolvedValue([])
    sedeFindMany.mockResolvedValue([])
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

  it('inclui sede Caso B (tenant filho) na lista da mãe e omite o filho como torcida', async () => {
    tenantFindMany.mockResolvedValue([
      {
        id: 't-mae',
        nome: 'Gaviões da Fiel',
        slug: 'gavioes',
        logoUrl: 'https://res.cloudinary.com/demo/gavioes.png',
        corPrimaria: '#000',
        torcidaConhecidaId: null,
        torcidaConhecida: null,
        _count: { membros: 5 },
      },
      {
        id: 't-pde',
        nome: 'PDE Praia Grande',
        slug: 'pde-praia-grande',
        logoUrl: null,
        corPrimaria: '#000',
        torcidaConhecidaId: null,
        torcidaConhecida: null,
        _count: { membros: 1 },
      },
    ])

    getAncestorTenantIds.mockImplementation(async (id: string) =>
      id === 't-pde' ? ['t-mae'] : [],
    )
    getDescendantTenantIds.mockImplementation(async (id: string) =>
      id === 't-mae' ? ['t-pde'] : [],
    )
    sedeFindMany.mockResolvedValue([
      {
        id: 'sede-raiz',
        nome: 'Sede Nacional',
        tipo: 'SEDE',
        cidade: 'São Paulo',
        estado: 'SP',
        endereco: null,
        sedeId: null,
        tenantId: 't-mae',
        lat: null,
        lng: null,
        fotoUrl: null,
        streetViewHeading: null,
        streetViewPitch: null,
        streetViewFov: null,
      },
      {
        id: 'sede-pde',
        nome: 'PDE Praia Grande',
        tipo: 'PONTO_ENCONTRO',
        cidade: 'Praia Grande',
        estado: 'SP',
        endereco: null,
        sedeId: 'sede-raiz',
        tenantId: 't-pde',
        lat: null,
        lng: null,
        fotoUrl: null,
        streetViewHeading: null,
        streetViewPitch: null,
        streetViewFov: null,
      },
    ])

    const { getTorcidasPorAfiliacao } = await import('@/lib/onboarding')
    const lista = await getTorcidasPorAfiliacao('af-1')

    expect(lista.map((t) => t.id)).toEqual(['t-mae'])
    expect(lista[0]?.sedes.map((s) => s.id)).toEqual(['sede-raiz', 'sede-pde'])
    expect(lista[0]?.sedes.find((s) => s.id === 'sede-pde')?.tenantId).toBe('t-pde')
  })
})

describe('getSedesDaTorcidaOnboarding', () => {
  beforeEach(() => {
    vi.resetModules()
    sedeFindMany.mockReset()
    getDescendantTenantIds.mockReset()
    getDescendantTenantIds.mockResolvedValue(['t-pde'])
    sedeFindMany.mockResolvedValue([
      {
        id: 'sede-pde',
        nome: 'PDE Novo',
        tipo: 'PONTO_ENCONTRO',
        cidade: 'Santos',
        estado: 'SP',
        endereco: null,
        sedeId: 'sede-raiz',
        tenantId: 't-pde',
        lat: -23.9,
        lng: -46.3,
        fotoUrl: null,
        streetViewHeading: null,
        streetViewPitch: null,
        streetViewFov: null,
      },
    ])
  })

  it('consulta sedes da mãe e dos descendentes', async () => {
    const { getSedesDaTorcidaOnboarding } = await import('@/lib/onboarding')
    const sedes = await getSedesDaTorcidaOnboarding('t-mae')

    expect(getDescendantTenantIds).toHaveBeenCalledWith('t-mae')
    expect(sedeFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: { in: ['t-mae', 't-pde'] }, ativa: true },
      }),
    )
    expect(sedes).toHaveLength(1)
    expect(sedes[0]?.id).toBe('sede-pde')
    expect(sedes[0]?.tenantId).toBe('t-pde')
  })
})
