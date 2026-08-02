import { beforeEach, describe, expect, it, vi } from 'vitest'

const findFirst = vi.hoisted(() => vi.fn())

vi.mock('@torcida/db', () => ({
  db: {
    saasMembro: { findFirst: (...args: unknown[]) => findFirst(...args) },
  },
}))

describe('resolveUserTenantSlugForUser', () => {
  beforeEach(() => {
    findFirst.mockReset()
  })

  it('prioriza sócio APROVADO', async () => {
    findFirst.mockResolvedValueOnce({ tenant: { slug: 'furia-jovem' } })
    const { resolveUserTenantSlugForUser } = await import('@/lib/tenant-context')
    await expect(resolveUserTenantSlugForUser('u1')).resolves.toBe('furia-jovem')
    expect(findFirst).toHaveBeenCalledTimes(1)
  })

  it('usa SOCIO PENDENTE quando não há aprovado (comunidade enquanto analisa)', async () => {
    findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ tenant: { slug: 'furia-jovem' } })
    const { resolveUserTenantSlugForUser } = await import('@/lib/tenant-context')
    await expect(resolveUserTenantSlugForUser('u1')).resolves.toBe('furia-jovem')
  })

  it('não abre tenant para TORCEDOR — fica na CN do clube', async () => {
    findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null)
    const { resolveUserTenantSlugForUser } = await import('@/lib/tenant-context')
    await expect(resolveUserTenantSlugForUser('u1')).resolves.toBeNull()
  })
})
