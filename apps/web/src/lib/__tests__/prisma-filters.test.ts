import { describe, expect, it } from 'vitest'
import { compactOr, orTenantIdsIn, prismaIn } from '@/lib/prisma-filters'

describe('prisma-filters', () => {
  it('prismaIn retorna undefined para lista vazia', () => {
    expect(prismaIn([])).toBeUndefined()
    expect(prismaIn(['a'])).toEqual({ in: ['a'] })
  })

  it('orTenantIdsIn omite ramo quando não há tenants', () => {
    expect(orTenantIdsIn([])).toBeNull()
    expect(orTenantIdsIn(['t1'])).toEqual({ tenantId: { in: ['t1'] } })
  })

  it('compactOr remove ramos nulos do OR', () => {
    expect(
      compactOr([
        { tenant: { sintetico: true } },
        null,
        false,
        undefined,
        { alcanceNacional: true },
      ]),
    ).toEqual([{ tenant: { sintetico: true } }, { alcanceNacional: true }])
  })
})
