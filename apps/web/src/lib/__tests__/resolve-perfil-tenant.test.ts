import { beforeEach, describe, expect, it, vi } from 'vitest'

const findUniqueSaas = vi.hoisted(() => vi.fn())
const findManySaas = vi.hoisted(() => vi.fn())
const findManyPerfilMembro = vi.hoisted(() => vi.fn())
const findUniquePerfil = vi.hoisted(() => vi.fn())
const findUniqueTenant = vi.hoisted(() => vi.fn())
const getTenantFromHost = vi.hoisted(() => vi.fn())
const getOrCreateComunidadeNacionalTenant = vi.hoisted(() => vi.fn())

vi.mock('@torcida/db', () => ({
  db: {
    saasMembro: { findUnique: findUniqueSaas, findMany: findManySaas },
    perfilMembro: { findMany: findManyPerfilMembro },
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

/** Portal de unidade Caso B — nasce depois da Sede, e é isso que confunde. */
const subsede = {
  id: 'tenant-subsede',
  nome: 'Subsede Rio Claro',
  slug: 'subsede-rio-claro',
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
    findManySaas.mockReset()
    findManyPerfilMembro.mockReset()
    findUniquePerfil.mockReset()
    findUniqueTenant.mockReset()
    getTenantFromHost.mockReset()
    getOrCreateComunidadeNacionalTenant.mockReset()
  })

  it('torcedor global no host da TO resolve CN sintética (não Gaviões)', async () => {
    getTenantFromHost.mockResolvedValue(gavioes)
    findUniqueSaas.mockResolvedValue(null)
    findManySaas.mockResolvedValue([])
    findUniquePerfil.mockResolvedValue({
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

  it('torcedor APROVADO no host também fica na TO (ficha), sem virar sócio', async () => {
    getTenantFromHost.mockResolvedValue(gavioes)
    findUniqueSaas.mockResolvedValue({ status: 'APROVADO', tipo: 'TORCEDOR' })

    const tenant = await resolvePerfilTenantForUser('user-torcedor', 'viewer')

    expect(tenant?.id).toBe(gavioes.id)
    expect(findUniquePerfil).not.toHaveBeenCalled()
  })

  it('perfil visitado de torcedor global (viewer noutro user) resolve CN', async () => {
    getTenantFromHost.mockResolvedValue(gavioes)
    findUniqueSaas.mockResolvedValue(null)
    findManySaas.mockResolvedValue([])
    findUniquePerfil.mockResolvedValue({
      afiliacaoId: 'af-corinthians',
    })
    getOrCreateComunidadeNacionalTenant.mockResolvedValue({ id: cnTimao.id })
    findUniqueTenant.mockResolvedValue(cnTimao)

    const tenant = await resolvePerfilTenantForUser('user-torcedor', 'user-socio')

    expect(tenant?.id).toBe(cnTimao.id)
    expect(tenant?.sintetico).toBe(true)
  })

  // ── Desempate entre vínculos (o bug do vínculo fabricado) ───────────────────

  it('vínculo único dispensa a consulta de PerfilMembro', async () => {
    getTenantFromHost.mockResolvedValue(null)
    findManySaas.mockResolvedValue([{ tenantId: gavioes.id, tenant: gavioes }])

    const tenant = await resolvePerfilTenantForUser('user-socio', 'viewer')

    expect(tenant?.id).toBe(gavioes.id)
    expect(findManyPerfilMembro).not.toHaveBeenCalled()
  })

  it('Sede ganha do portal de unidade mais recente quando o PerfilMembro vive nela', async () => {
    getTenantFromHost.mockResolvedValue(null)
    // Ordem da query: mais recente primeiro — a unidade promovida depois.
    findManySaas.mockResolvedValue([
      { tenantId: subsede.id, tenant: subsede },
      { tenantId: gavioes.id, tenant: gavioes },
    ])
    findManyPerfilMembro.mockResolvedValue([{ tenantId: gavioes.id }])

    const tenant = await resolvePerfilTenantForUser('user-socio', 'viewer')

    expect(tenant?.id).toBe(gavioes.id)
  })

  it('sem PerfilMembro em nenhum dos vínculos, cai na recência', async () => {
    getTenantFromHost.mockResolvedValue(null)
    findManySaas.mockResolvedValue([
      { tenantId: subsede.id, tenant: subsede },
      { tenantId: gavioes.id, tenant: gavioes },
    ])
    findManyPerfilMembro.mockResolvedValue([])

    const tenant = await resolvePerfilTenantForUser('user-socio', 'viewer')

    expect(tenant?.id).toBe(subsede.id)
  })

  it('torcida inativa é descartada na query, não depois', async () => {
    getTenantFromHost.mockResolvedValue(null)
    findManySaas.mockResolvedValue([{ tenantId: gavioes.id, tenant: gavioes }])

    await resolvePerfilTenantForUser('user-socio', 'viewer')

    expect(findManySaas).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenant: { ativo: true } }),
      }),
    )
  })
})
