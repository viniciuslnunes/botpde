import { beforeEach, describe, expect, it, vi } from 'vitest'

const findUniqueUser = vi.hoisted(() => vi.fn())
const getUserPermissionsInTenant = vi.hoisted(() => vi.fn())
const isSuperAdminEmail = vi.hoisted(() => vi.fn(() => false))

vi.mock('@torcida/db', () => ({
  db: { user: { findUnique: findUniqueUser } },
}))

vi.mock('@/lib/tenant', () => ({
  getUserPermissionsInTenant,
}))

vi.mock('@/lib/tenant-context', () => ({
  isSuperAdminEmail,
}))

import { PERMISSIONS } from '@torcida/types'
import { podeLerPermalinkComoModerador } from '@/lib/feed-permalink'

describe('podeLerPermalinkComoModerador', () => {
  beforeEach(() => {
    findUniqueUser.mockReset()
    getUserPermissionsInTenant.mockReset()
    isSuperAdminEmail.mockReset().mockReturnValue(false)
    findUniqueUser.mockResolvedValue({ email: 'socio@example.com' })
  })

  it('libera super-admin sem consultar RBAC do tenant', async () => {
    isSuperAdminEmail.mockReturnValue(true)
    await expect(podeLerPermalinkComoModerador('u-sa', 't-pde')).resolves.toBe(true)
    expect(getUserPermissionsInTenant).not.toHaveBeenCalled()
  })

  it('libera quem tem community:moderate no tenant do post', async () => {
    getUserPermissionsInTenant.mockResolvedValue({
      rolePermissions: [PERMISSIONS.COMMUNITY_MODERATE],
      overrides: [],
    })
    await expect(podeLerPermalinkComoModerador('u-mod', 't-pde')).resolves.toBe(true)
  })

  it('libera community:view (oversight da fila, só leitura)', async () => {
    getUserPermissionsInTenant.mockResolvedValue({
      rolePermissions: [PERMISSIONS.COMMUNITY_VIEW],
      overrides: [],
    })
    await expect(podeLerPermalinkComoModerador('u-view', 't-pde')).resolves.toBe(true)
  })

  it('recusa membro comum — rival ou sócio sem permissão de moderação', async () => {
    getUserPermissionsInTenant.mockResolvedValue({
      rolePermissions: [PERMISSIONS.COMMUNITY_POST],
      overrides: [],
    })
    await expect(podeLerPermalinkComoModerador('u-membro', 't-pde')).resolves.toBe(false)
  })
})
