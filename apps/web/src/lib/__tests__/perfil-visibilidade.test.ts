import { beforeEach, describe, expect, it, vi } from 'vitest'

const findManyMembro = vi.hoisted(() => vi.fn())
const findFirstMembro = vi.hoisted(() => vi.fn())
const findManyCargo = vi.hoisted(() => vi.fn())
const findUniquePerfil = vi.hoisted(() => vi.fn())
const countRivalClube = vi.hoisted(() => vi.fn())
const findUniqueTenant = vi.hoisted(() => vi.fn())
const getTenantRelation = vi.hoisted(() => vi.fn())

vi.mock('@torcida/db', () => ({
  db: {
    saasMembro: { findMany: findManyMembro, findFirst: findFirstMembro },
    userRole: { findMany: findManyCargo },
    perfilTorcedor: { findUnique: findUniquePerfil },
    rivalidadeClube: { count: countRivalClube },
    tenant: { findUnique: findUniqueTenant },
  },
}))

vi.mock('@/lib/hierarquia', () => ({
  getTenantRelation,
}))

import { podeVerPerfilComunidade, saoUsuariosRivais } from '@/lib/perfil-visibilidade'

const gavioes = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const mancha = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const userGavioes = '11111111-1111-1111-1111-111111111111'
const userMancha = '22222222-2222-2222-2222-222222222222'

describe('saoUsuariosRivais', () => {
  beforeEach(() => {
    findManyMembro.mockReset()
    findFirstMembro.mockReset()
    findManyCargo.mockReset()
    findUniquePerfil.mockReset()
    countRivalClube.mockReset()
    findManyCargo.mockResolvedValue([])
    countRivalClube.mockResolvedValue(0)
  })

  it('sócio×sócio rival → true', async () => {
    findManyMembro.mockResolvedValue([
      { userId: userGavioes, tenantId: gavioes },
      { userId: userMancha, tenantId: mancha },
    ])
    getTenantRelation.mockResolvedValue('rival')
    await expect(saoUsuariosRivais(userGavioes, userMancha)).resolves.toBe(true)
  })

  it('torcedor×sócio rival → true (não só sócio×sócio)', async () => {
    findManyMembro.mockResolvedValue([
      { userId: userGavioes, tenantId: gavioes },
      { userId: userMancha, tenantId: mancha },
    ])
    getTenantRelation.mockResolvedValue('rival')
    await expect(saoUsuariosRivais(userGavioes, userMancha)).resolves.toBe(true)
  })

  it('aliados não são rivais mesmo com rivalidade de clube no catálogo', async () => {
    findManyMembro.mockResolvedValue([
      { userId: userGavioes, tenantId: gavioes },
      { userId: userMancha, tenantId: mancha },
    ])
    getTenantRelation.mockResolvedValue('allied')
    await expect(saoUsuariosRivais(userGavioes, userMancha)).resolves.toBe(false)
    expect(countRivalClube).not.toHaveBeenCalled()
  })

  it('torcedor global de clube rival (sem SaasMembro) → true via RivalidadeClube', async () => {
    findManyMembro.mockResolvedValue([])
    findUniquePerfil.mockImplementation(async (args: { where: { userId: string } }) => {
      if (args.where.userId === userGavioes) return { afiliacaoId: 'af-corinthians' }
      return { afiliacaoId: 'af-palmeiras' }
    })
    countRivalClube.mockResolvedValue(1)
    await expect(saoUsuariosRivais(userGavioes, userMancha)).resolves.toBe(true)
  })
})

describe('podeVerPerfilComunidade', () => {
  beforeEach(() => {
    findManyMembro.mockReset()
    findFirstMembro.mockReset()
    findManyCargo.mockReset()
    findUniquePerfil.mockReset()
    countRivalClube.mockReset()
    findUniqueTenant.mockReset()
    findManyCargo.mockResolvedValue([])
    findManyMembro.mockResolvedValue([])
    countRivalClube.mockResolvedValue(0)
  })

  it('próprio perfil sempre visível', async () => {
    await expect(
      podeVerPerfilComunidade(userGavioes, userGavioes, gavioes, gavioes),
    ).resolves.toBe(true)
  })

  it('rival → inexistente', async () => {
    findManyMembro.mockResolvedValue([
      { userId: userGavioes, tenantId: gavioes },
      { userId: userMancha, tenantId: mancha },
    ])
    getTenantRelation.mockResolvedValue('rival')
    await expect(
      podeVerPerfilComunidade(userGavioes, userMancha, mancha, gavioes),
    ).resolves.toBe(false)
  })

  it('mesmo clube (co-irmã / CN) → visível', async () => {
    findManyMembro.mockResolvedValue([
      { userId: userGavioes, tenantId: gavioes },
      { userId: userMancha, tenantId: 'camisa-12' },
    ])
    getTenantRelation.mockResolvedValue('unrelated')
    findUniquePerfil.mockResolvedValue({ afiliacaoId: 'af-corinthians' })
    findUniqueTenant.mockResolvedValue({ afiliacaoId: 'af-corinthians' })
    await expect(
      podeVerPerfilComunidade(userGavioes, userMancha, 'camisa-12', gavioes),
    ).resolves.toBe(true)
  })

  it('unrelated de outro clube não-rival → inexistente', async () => {
    findManyMembro.mockResolvedValue([
      { userId: userGavioes, tenantId: gavioes },
      { userId: userMancha, tenantId: mancha },
    ])
    getTenantRelation.mockResolvedValue('unrelated')
    findUniquePerfil.mockResolvedValue({ afiliacaoId: 'af-corinthians' })
    findUniqueTenant.mockResolvedValue({ afiliacaoId: 'af-remo' })
    countRivalClube.mockResolvedValue(0)
    await expect(
      podeVerPerfilComunidade(userGavioes, userMancha, mancha, gavioes),
    ).resolves.toBe(false)
  })
})
