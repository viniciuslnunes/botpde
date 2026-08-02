import { beforeEach, describe, expect, it, vi } from 'vitest'

const getActiveTenant = vi.hoisted(() => vi.fn())
const resolverTorcidaDoTorcedor = vi.hoisted(() => vi.fn())
const tenantFindFirst = vi.hoisted(() => vi.fn())
const getTenantFromHost = vi.hoisted(() => vi.fn())

vi.mock('@/lib/tenant', () => ({
  getActiveTenant: (...args: unknown[]) => getActiveTenant(...args),
  resolveTenantLogoUrl: vi.fn(),
  getTenantFromHost: (...args: unknown[]) => getTenantFromHost(...args),
}))

vi.mock('@/lib/tenant-context', () => ({
  resolverTorcidaDoTorcedor: (...args: unknown[]) => resolverTorcidaDoTorcedor(...args),
}))

vi.mock('@/lib/isolamento', () => ({
  filtrarTenantsRestritos: (ids: string[]) => ids,
}))

vi.mock('@torcida/db', () => ({
  db: {
    tenant: { findFirst: (...args: unknown[]) => tenantFindFirst(...args) },
    afiliacao: { findUnique: vi.fn() },
    perfilTorcedor: { findUnique: vi.fn() },
  },
}))

describe('resolveTenantMinhaTorcida', () => {
  beforeEach(() => {
    getActiveTenant.mockReset()
    resolverTorcidaDoTorcedor.mockReset()
    tenantFindFirst.mockReset()
    getTenantFromHost.mockReset()
  })

  it('usa sócio ativo e nunca consulta getTenantFromHost', async () => {
    getActiveTenant.mockResolvedValue({ id: 't-tricolor', nome: 'Tricolor', slug: 'tti' })
    const { resolveTenantMinhaTorcida } = await import('@/lib/comunidade-contexto')
    const t = await resolveTenantMinhaTorcida('u1', 'a@b.c')
    expect(t?.id).toBe('t-tricolor')
    expect(getTenantFromHost).not.toHaveBeenCalled()
    expect(resolverTorcidaDoTorcedor).not.toHaveBeenCalled()
  })

  it('TORCEDOR: resolve pela unidade do vínculo, não pelo TENANT_SLUG', async () => {
    getActiveTenant.mockResolvedValue(null)
    resolverTorcidaDoTorcedor.mockResolvedValue({
      id: 't-tricolor',
      nome: 'Tricolor Independente',
      afiliacaoId: 'af-sp',
      logoUrl: null,
      corPrimaria: '#ed1c24',
      balancoFinanceiroVisivel: false,
    })
    tenantFindFirst.mockResolvedValue({
      id: 't-tricolor',
      nome: 'torcida tricolor independente',
      slug: 'tti',
      ativo: true,
      sintetico: false,
    })

    const { resolveTenantMinhaTorcida } = await import('@/lib/comunidade-contexto')
    const t = await resolveTenantMinhaTorcida('u1', null)
    expect(t?.id).toBe('t-tricolor')
    expect(tenantFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 't-tricolor', sintetico: false }),
      }),
    )
    expect(getTenantFromHost).not.toHaveBeenCalled()
  })
})
