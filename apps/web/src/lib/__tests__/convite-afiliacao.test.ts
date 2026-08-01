import { beforeEach, describe, expect, it, vi } from 'vitest'

const getAncestorTenantIds = vi.hoisted(() => vi.fn())
const findMany = vi.hoisted(() => vi.fn())

vi.mock('@/lib/hierarquia', () => ({
  getAncestorTenantIds: (...args: unknown[]) => getAncestorTenantIds(...args),
}))

vi.mock('@torcida/db', () => ({
  db: {
    tenant: { findMany: (...args: unknown[]) => findMany(...args) },
  },
}))

describe('resolverAfiliacaoIdEfetiva', () => {
  beforeEach(() => {
    getAncestorTenantIds.mockReset()
    findMany.mockReset()
  })

  it('usa afiliacaoId direto quando existe', async () => {
    const { resolverAfiliacaoIdEfetiva } = await import('@/lib/convite')
    await expect(resolverAfiliacaoIdEfetiva('t-filho', 'afil-1')).resolves.toBe('afil-1')
    expect(getAncestorTenantIds).not.toHaveBeenCalled()
  })

  it('herda do ancestral mais próximo quando o tenant está órfão', async () => {
    getAncestorTenantIds.mockResolvedValue(['t-mae', 't-avo'])
    findMany.mockResolvedValue([
      { id: 't-avo', afiliacaoId: 'afil-avo' },
      { id: 't-mae', afiliacaoId: 'afil-mae' },
    ])

    const { resolverAfiliacaoIdEfetiva } = await import('@/lib/convite')
    await expect(resolverAfiliacaoIdEfetiva('t-filho', null)).resolves.toBe('afil-mae')
  })

  it('retorna null quando ninguém na cadeia tem clube', async () => {
    getAncestorTenantIds.mockResolvedValue(['t-mae'])
    findMany.mockResolvedValue([])

    const { resolverAfiliacaoIdEfetiva } = await import('@/lib/convite')
    await expect(resolverAfiliacaoIdEfetiva('t-filho', null)).resolves.toBeNull()
  })
})
