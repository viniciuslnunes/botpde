import { beforeEach, describe, expect, it, vi } from 'vitest'

const findUniqueSaas = vi.hoisted(() => vi.fn())
const findFirstSaas = vi.hoisted(() => vi.fn())
const findUniquePerfil = vi.hoisted(() => vi.fn())
const findUniqueTenant = vi.hoisted(() => vi.fn())
const getTenantFromHost = vi.hoisted(() => vi.fn())
const getOrCreateComunidadeNacionalTenant = vi.hoisted(() => vi.fn())

vi.mock('@torcida/db', () => ({
  db: {
    saasMembro: { findUnique: findUniqueSaas, findFirst: findFirstSaas },
    perfilTorcedor: { findUnique: findUniquePerfil },
    tenant: { findUnique: findUniqueTenant },
  },
}))

vi.mock('@/lib/tenant', () => ({
  getTenantFromHost,
}))

vi.mock('@/lib/comunidade-contexto', () => ({
  getOrCreateComunidadeNacionalTenant,
}))

import { resolvePerfilTenantForUser } from '@/lib/resolve-perfil-tenant'

const gavioes = {
  id: 'tenant-gavioes',
  nome: 'Gaviões da Fiel',
  slug: 'pde-gavioes-fiel',
  sintetico: false,
  ativo: true,
  afiliacaoId: 'af-corinthians',
}

const cnTimao = {
  id: 'tenant-cn',
  nome: 'Timão — Comunidade Nacional',
  slug: 'sport-club-corinthians-paulista-sp-nacional',
  sintetico: true,
  ativo: true,
  afiliacaoId: 'af-corinthians',
}

describe('resolvePerfilTenantForUser', () => {
  beforeEach(() => {
    findUniqueSaas.mockReset()
    findFirstSaas.mockReset()
    findUniquePerfil.mockReset()
    findUniqueTenant.mockReset()
    getTenantFromHost.mockReset()
    getOrCreateComunidadeNacionalTenant.mockReset()
  })

  it('torcedor global no host da TO resolve CN sintética (não Gaviões)', async () => {
    getTenantFromHost.mockResolvedValue(gavioes)
    findUniqueSaas.mockResolvedValue(null)
    findFirstSaas.mockResolvedValue(null)
    findUniquePerfil.mockResolvedValue({
      onboardingConcluidoEm: new Date(),
      afiliacaoId: 'af-corinthians',
    })
    getOrCreateComunidadeNacionalTenant.mockResolvedValue({ id: cnTimao.id })
    findUniqueTenant.mockResolvedValue(cnTimao)

    const tenant = await resolvePerfilTenantForUser('user-torcedor', 'user-torcedor')

    expect(tenant?.id).toBe(cnTimao.id)
    expect(tenant?.sintetico).toBe(true)
    expect(getOrCreateComunidadeNacionalTenant).toHaveBeenCalledWith('af-corinthians')
  })

  it('sócio aprovado no host mantém a TO', async () => {
    getTenantFromHost.mockResolvedValue(gavioes)
    findUniqueSaas.mockResolvedValue({ status: 'APROVADO', tipo: 'SOCIO' })

    const tenant = await resolvePerfilTenantForUser('user-socio', 'viewer')

    expect(tenant?.id).toBe(gavioes.id)
    expect(findUniquePerfil).not.toHaveBeenCalled()
  })

  it('perfil visitado de torcedor global (viewer noutro user) resolve CN', async () => {
    getTenantFromHost.mockResolvedValue(gavioes)
    findUniqueSaas.mockResolvedValue(null)
    findFirstSaas.mockResolvedValue(null)
    findUniquePerfil.mockResolvedValue({
      onboardingConcluidoEm: new Date(),
      afiliacaoId: 'af-corinthians',
    })
    getOrCreateComunidadeNacionalTenant.mockResolvedValue({ id: cnTimao.id })
    findUniqueTenant.mockResolvedValue(cnTimao)

    const tenant = await resolvePerfilTenantForUser('user-torcedor', 'user-socio')

    expect(tenant?.id).toBe(cnTimao.id)
  })
})
