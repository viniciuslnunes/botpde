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

  it('prioriza sócio APROVADO (canônico)', async () => {
    findFirst.mockResolvedValueOnce({ tenant: { slug: 'furia-jovem' } })
    const { resolveUserTenantSlugForUser } = await import('@/lib/tenant-context')
    await expect(resolveUserTenantSlugForUser('u1')).resolves.toBe('furia-jovem')
    expect(findFirst).toHaveBeenCalledTimes(1)
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'APROVADO',
          tipo: 'SOCIO',
          espelhado: false,
        }),
      }),
    )
  })

  it('não abre tenant para SOCIO PENDENTE — fica na CN até a aprovação', async () => {
    findFirst.mockResolvedValueOnce(null)
    const { resolveUserTenantSlugForUser } = await import('@/lib/tenant-context')
    await expect(resolveUserTenantSlugForUser('u1')).resolves.toBeNull()
  })

  it('não abre tenant para TORCEDOR — fica na CN do clube', async () => {
    findFirst.mockResolvedValueOnce(null)
    const { resolveUserTenantSlugForUser } = await import('@/lib/tenant-context')
    await expect(resolveUserTenantSlugForUser('u1')).resolves.toBeNull()
  })
})
