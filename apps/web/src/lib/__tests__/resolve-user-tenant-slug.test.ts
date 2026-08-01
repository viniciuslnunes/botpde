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

  it('usa TORCEDOR APROVADO quando não há sócio', async () => {
    findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ tenant: { slug: 'furia-jovem' } })
    const { resolveUserTenantSlugForUser } = await import('@/lib/tenant-context')
    await expect(resolveUserTenantSlugForUser('u1')).resolves.toBe('furia-jovem')
  })

  it('usa SOCIO PENDENTE como fallback (comunidade enquanto analisa)', async () => {
    findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ tenant: { slug: 'furia-jovem' } })
    const { resolveUserTenantSlugForUser } = await import('@/lib/tenant-context')
    await expect(resolveUserTenantSlugForUser('u1')).resolves.toBe('furia-jovem')
  })
})
