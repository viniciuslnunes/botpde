import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  tenantFindMany: vi.fn(),
  queryRaw: vi.fn(),
}))

vi.mock('@torcida/db', () => ({
  db: {
    tenant: { findMany: mocks.tenantFindMany },
    $queryRaw: mocks.queryRaw,
  },
}))

import {
  filtrarTenantsRaiz,
  listarTorcidasDoClube,
  paraTenantRaiz,
} from '@/lib/tenant-hierarquia-plataforma'

describe('filtrarTenantsRaiz', () => {
  it('remove portais Caso B (filhos do mapa mãe)', () => {
    const maePorFilho = new Map([
      ['fiel-sao-vicente', 'pde-gavioes-fiel'],
      ['subsede-rio-claro', 'pde-gavioes-fiel'],
    ])
    expect(
      filtrarTenantsRaiz(
        ['pde-gavioes-fiel', 'fiel-sao-vicente', 'outra-torcida', 'subsede-rio-claro'],
        maePorFilho,
      ),
    ).toEqual(['pde-gavioes-fiel', 'outra-torcida'])
  })

  it('preserva a ordem dos ids', () => {
    const maePorFilho = new Map([['b', 'a']])
    expect(filtrarTenantsRaiz(['c', 'a', 'b', 'd'], maePorFilho)).toEqual(['c', 'a', 'd'])
  })

  it('devolve todos se o mapa estiver vazio', () => {
    expect(filtrarTenantsRaiz(['a', 'b'], new Map())).toEqual(['a', 'b'])
  })
})

describe('listarTorcidasDoClube', () => {
  beforeEach(() => {
    mocks.tenantFindMany.mockReset()
    mocks.queryRaw.mockReset()
  })

  it('conta só torcida real: sem sintético, sem suspensa, sem portal de unidade', async () => {
    // O banco já devolve filtrado por ativo/sintético — o teste garante que o
    // filtro está na query, e que o portal Caso B cai no filtro de raiz.
    mocks.tenantFindMany.mockResolvedValue([
      { id: 'camisa-12' },
      { id: 'gavioes' },
      { id: 'fiel-sao-vicente' },
      { id: 'subsede-rio-claro' },
    ])
    mocks.queryRaw.mockResolvedValue([
      { filho: 'fiel-sao-vicente', mae: 'gavioes' },
      { filho: 'subsede-rio-claro', mae: 'gavioes' },
    ])

    await expect(listarTorcidasDoClube('corinthians')).resolves.toEqual(['camisa-12', 'gavioes'])

    expect(mocks.tenantFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { afiliacaoId: 'corinthians', ativo: true, sintetico: false },
      }),
    )
  })

  it('devolve vazio quando o clube não tem torcida na plataforma', async () => {
    mocks.tenantFindMany.mockResolvedValue([])
    mocks.queryRaw.mockResolvedValue([])
    await expect(listarTorcidasDoClube('clube-sem-torcida')).resolves.toEqual([])
  })
})

describe('paraTenantRaiz', () => {
  it('sobe portal filho para a mãe', () => {
    const maePorFilho = new Map([['filho', 'mae']])
    expect(paraTenantRaiz('filho', maePorFilho)).toBe('mae')
    expect(paraTenantRaiz('mae', maePorFilho)).toBe('mae')
  })
})
