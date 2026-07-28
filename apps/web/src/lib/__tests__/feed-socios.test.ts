import { beforeEach, describe, expect, it, vi } from 'vitest'

const findUnique = vi.hoisted(() => vi.fn())
const findUniqueUser = vi.hoisted(() => vi.fn())
const isSuperAdminEmail = vi.hoisted(() => vi.fn(() => false))

vi.mock('@torcida/db', () => ({
  db: { saasMembro: { findUnique }, user: { findUnique: findUniqueUser } },
}))

// Stubs dos módulos vizinhos importados por feed.ts que puxam next/cache etc.
vi.mock('@/lib/comunidade', () => ({ getFeedComunidade: vi.fn() }))
vi.mock('@/lib/comunidade-contexto', () => ({ getTenantIdsPorAfiliacao: vi.fn() }))
vi.mock('@/lib/hierarquia', () => ({ getVisibleTenantIds: vi.fn() }))
vi.mock('@/lib/perfil-social', () => ({
  getAutoresSemAcesso: vi.fn(),
  getContagensSeguimento: vi.fn(),
  resolverAvatarSocial: vi.fn(),
  podeVerConteudoSocial: vi.fn(),
}))
vi.mock('@/lib/social', () => ({ getSeguimentoStatus: vi.fn() }))
vi.mock('@/lib/autor-badges', () => ({ enriquecerPostsComBadges: vi.fn() }))
vi.mock('@/lib/noticias', () => ({ getNoticiasAprovadas: vi.fn() }))
vi.mock('@/lib/tenant-context', () => ({ isSuperAdminEmail }))

import { podeVerFeedSocios } from '@/lib/feed'

describe('podeVerFeedSocios', () => {
  beforeEach(() => {
    findUnique.mockReset()
    findUniqueUser.mockReset()
    isSuperAdminEmail.mockReset().mockReturnValue(false)
  })

  it('retorna false sem userId (anônimo)', async () => {
    await expect(podeVerFeedSocios(undefined, 't1')).resolves.toBe(false)
    expect(findUnique).not.toHaveBeenCalled()
  })

  it('retorna false sem vínculo no tenant', async () => {
    findUnique.mockResolvedValue(null)
    findUniqueUser.mockResolvedValue({ email: 'u1@example.com' })
    await expect(podeVerFeedSocios('u1', 't1')).resolves.toBe(false)
  })

  it('retorna false para PENDENTE', async () => {
    findUnique.mockResolvedValue({ status: 'PENDENTE' })
    findUniqueUser.mockResolvedValue({ email: 'u2@example.com' })
    await expect(podeVerFeedSocios('u2', 't1')).resolves.toBe(false)
  })

  it('retorna false para REPROVADO', async () => {
    findUnique.mockResolvedValue({ status: 'REPROVADO' })
    findUniqueUser.mockResolvedValue({ email: 'u3@example.com' })
    await expect(podeVerFeedSocios('u3', 't1')).resolves.toBe(false)
  })

  it('retorna true para APROVADO', async () => {
    findUnique.mockResolvedValue({ status: 'APROVADO' })
    await expect(podeVerFeedSocios('u4', 't1')).resolves.toBe(true)
    expect(findUnique).toHaveBeenCalledWith({
      where: { tenantId_userId: { tenantId: 't1', userId: 'u4' } },
      select: { status: true },
    })
    expect(findUniqueUser).not.toHaveBeenCalled()
  })

  it('retorna true para super admin sem vínculo no tenant', async () => {
    findUnique.mockResolvedValue(null)
    findUniqueUser.mockResolvedValue({ email: 'admin@torcida.com' })
    isSuperAdminEmail.mockReturnValue(true)
    await expect(podeVerFeedSocios('u5', 't1')).resolves.toBe(true)
    expect(findUniqueUser).toHaveBeenCalledWith({
      where: { id: 'u5' },
      select: { email: true },
    })
  })
})
