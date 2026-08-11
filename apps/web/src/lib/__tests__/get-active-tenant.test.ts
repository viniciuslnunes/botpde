/**
 * getActiveTenant: subdomínio e cookie só abrem tenant com SOCIO APROVADO.
 * TORCEDOR / PENDENTE no host da Sede → null (CN), sem vazar loja/eventos/admin.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const cookiesGet = vi.hoisted(() => vi.fn())
const headersGet = vi.hoisted(() => vi.fn())
const tenantFindUnique = vi.hoisted(() => vi.fn())
const perfilFindUnique = vi.hoisted(() => vi.fn())
const vinculoAutoriza = vi.hoisted(() => vi.fn())
const resolveUserSlug = vi.hoisted(() => vi.fn())
const isSuperAdminFn = vi.hoisted(() => vi.fn((_email?: string | null) => false))

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: cookiesGet }),
  headers: async () => ({ get: headersGet }),
}))

vi.mock('next/cache', () => ({
  unstable_cache:
    <T extends (...args: never[]) => unknown>(fn: T) =>
    (...args: Parameters<T>) =>
      fn(...args),
  revalidateTag: () => {},
}))

vi.mock('@/lib/env', () => ({
  env: { ROOT_DOMAIN: 'torcida.app', TENANT_SLUG: undefined, NODE_ENV: 'test' },
}))

vi.mock('@/lib/request-origin', () => ({
  resolveRequestHost: (forwarded: string, host: string) => forwarded || host,
}))

vi.mock('@torcida/db', () => ({
  db: {
    tenant: { findUnique: (...args: unknown[]) => tenantFindUnique(...args) },
    perfilTorcedor: { findUnique: (...args: unknown[]) => perfilFindUnique(...args) },
  },
}))

vi.mock('@/lib/tenant-context', () => ({
  TENANT_CTX_COOKIE: 'torcida_ctx',
  vinculoAutorizaContextoTenant: (userId: string, slug: string) => vinculoAutoriza(userId, slug),
  resolveUserTenantSlugForUser: (userId: string) => resolveUserSlug(userId),
  isSuperAdminEmail: (email: string | null | undefined) => isSuperAdminFn(email),
}))

describe('getActiveTenant — subdomínio com o mesmo critério do cookie', () => {
  beforeEach(() => {
    vi.resetModules()
    cookiesGet.mockReset().mockReturnValue(undefined)
    headersGet.mockReset()
    tenantFindUnique.mockReset()
    perfilFindUnique.mockReset()
    vinculoAutoriza.mockReset().mockResolvedValue(false)
    resolveUserSlug.mockReset().mockResolvedValue(null)
    isSuperAdminFn.mockReset().mockReturnValue(false)
  })

  function hostGavioes() {
    headersGet.mockImplementation((name: string) => {
      if (name === 'host') return 'pde-gavioes-fiel.torcida.app'
      return null
    })
  }

  function tenantGavioes() {
    tenantFindUnique.mockResolvedValue({
      id: 't-gavioes',
      slug: 'pde-gavioes-fiel',
      nome: 'Gaviões da Fiel',
      ativo: true,
      corPrimaria: '#000',
      logoUrl: null,
    })
  }

  it('PENDENTE no subdomínio da Sede → null (não abre loja/eventos de sócio)', async () => {
    hostGavioes()
    tenantGavioes()
    vinculoAutoriza.mockResolvedValue(false)
    resolveUserSlug.mockResolvedValue(null)
    perfilFindUnique.mockResolvedValue({ afiliacaoId: 'af-cor' })

    const { getActiveTenant } = await import('@/lib/tenant')
    await expect(getActiveTenant('u-pendente', 'p@example.com')).resolves.toBeNull()
    expect(vinculoAutoriza).toHaveBeenCalledWith('u-pendente', 'pde-gavioes-fiel')
  })

  it('TORCEDOR no subdomínio da Sede → null', async () => {
    hostGavioes()
    tenantGavioes()
    vinculoAutoriza.mockResolvedValue(false)
    resolveUserSlug.mockResolvedValue(null)
    perfilFindUnique.mockResolvedValue({ afiliacaoId: 'af-cor' })

    const { getActiveTenant } = await import('@/lib/tenant')
    await expect(getActiveTenant('u-torcedor', 't@example.com')).resolves.toBeNull()
  })

  it('SOCIO APROVADO no subdomínio autorizado → tenant do host', async () => {
    hostGavioes()
    tenantGavioes()
    vinculoAutoriza.mockResolvedValue(true)

    const { getActiveTenant } = await import('@/lib/tenant')
    const tenant = await getActiveTenant('u-socio', 's@example.com')
    expect(tenant?.slug).toBe('pde-gavioes-fiel')
    expect(vinculoAutoriza).toHaveBeenCalledWith('u-socio', 'pde-gavioes-fiel')
  })

  it('super-admin no subdomínio → tenant do host sem checar vínculo', async () => {
    hostGavioes()
    tenantGavioes()
    isSuperAdminFn.mockReturnValue(true)

    const { getActiveTenant } = await import('@/lib/tenant')
    const tenant = await getActiveTenant('u-sa', 'admin@torcida.com')
    expect(tenant?.slug).toBe('pde-gavioes-fiel')
    expect(vinculoAutoriza).not.toHaveBeenCalled()
  })

  it('super-admin no apex sem cookie usa torcida-casa (sócio)', async () => {
    headersGet.mockImplementation((name: string) => {
      if (name === 'host') return 'torcida.app'
      return null
    })
    isSuperAdminFn.mockReturnValue(true)
    resolveUserSlug.mockResolvedValue('pde-gavioes-fiel')
    tenantGavioes()

    const { getActiveTenant } = await import('@/lib/tenant')
    const tenant = await getActiveTenant('u-sa', 'admin@torcida.com')
    expect(tenant?.slug).toBe('pde-gavioes-fiel')
    expect(resolveUserSlug).toHaveBeenCalledWith('u-sa')
  })

  it('cookie da Sede sem vínculo APROVADO é ignorado (perfil → CN)', async () => {
    headersGet.mockImplementation((name: string) => {
      if (name === 'host') return 'torcida.app'
      return null
    })
    cookiesGet.mockReturnValue({ value: 'pde-gavioes-fiel' })
    vinculoAutoriza.mockResolvedValue(false)
    resolveUserSlug.mockResolvedValue(null)
    perfilFindUnique.mockResolvedValue({ afiliacaoId: 'af-cor' })

    const { getActiveTenant } = await import('@/lib/tenant')
    await expect(getActiveTenant('u-pendente', 'p@example.com')).resolves.toBeNull()
  })
})
