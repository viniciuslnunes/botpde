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
  listarTenantsNaoRaiz,
  listarTorcidasDoClube,
  paraTenantRaiz,
  WHERE_TENANT_E_TORCIDA,
  whereTenantEhTorcida,
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

  it('WHERE_TENANT_E_TORCIDA exige ativo — quem lista o clube não pode afrouxar', () => {
    // O card "Uso do clube" e a aba Métricas montam a query com esta constante.
    // Se ela deixar de exigir `ativo`, o tenant suspenso volta para a lista sob
    // um KPI que não o conta — foi assim que a "FIEL CUBATÃO" (erro de registro)
    // apareceu como sétima torcida do Corinthians num KPI de 6.
    expect(WHERE_TENANT_E_TORCIDA).toEqual({ ativo: true, sintetico: false })
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

describe('whereTenantEhTorcida', () => {
  beforeEach(() => {
    mocks.queryRaw.mockReset()
  })

  it('exclui os portais Caso B do `where` — é o que fecha a divergência 557 × 554', async () => {
    mocks.queryRaw.mockResolvedValue([
      { filho: 'fiel-sao-vicente', mae: 'pde-gavioes-fiel' },
      { filho: 'subsede-rio-claro', mae: 'pde-gavioes-fiel' },
    ])

    expect(await whereTenantEhTorcida()).toEqual({
      ...WHERE_TENANT_E_TORCIDA,
      id: { notIn: ['fiel-sao-vicente', 'subsede-rio-claro'] },
    })
  })

  it('sem promoção Caso B não emite `notIn` — `id: { notIn: [] }` não filtra nada e só polui o plano', async () => {
    mocks.queryRaw.mockResolvedValue([])
    const where = await whereTenantEhTorcida()

    expect(where).toEqual({ ...WHERE_TENANT_E_TORCIDA })
    expect(where).not.toHaveProperty('id')
  })

  it('devolve objeto novo a cada chamada: quem monta `where` espalha e completa o resultado', async () => {
    mocks.queryRaw.mockResolvedValue([{ filho: 'b', mae: 'a' }])

    const primeiro = await whereTenantEhTorcida()
    const segundo = await whereTenantEhTorcida()

    expect(primeiro).not.toBe(segundo)
    // Sujar um não pode contaminar o outro dentro da mesma requisição.
    ;(primeiro as { ativo: boolean }).ativo = false
    expect(segundo.ativo).toBe(true)
  })

  it('mapa mãe vira lista de ids de filho — nenhuma mãe entra por engano', async () => {
    mocks.queryRaw.mockResolvedValue([
      { filho: 'filho-1', mae: 'mae-1' },
      { filho: 'filho-2', mae: 'mae-1' },
    ])

    expect(await listarTenantsNaoRaiz()).toEqual(['filho-1', 'filho-2'])
  })
})
