import { beforeEach, describe, expect, it, vi } from 'vitest'

const findUniquePerfilMembro = vi.hoisted(() => vi.fn())
const findUniqueSaas = vi.hoisted(() => vi.fn())
const resolvePerfilTenantForUser = vi.hoisted(() => vi.fn())

vi.mock('@torcida/db', () => ({
  db: {
    perfilMembro: { findUnique: findUniquePerfilMembro },
    saasMembro: { findUnique: findUniqueSaas },
  },
}))

vi.mock('@/lib/resolve-perfil-tenant', () => ({
  resolvePerfilTenantForUser,
}))

vi.mock('@/lib/hierarquia', () => ({
  getAlliedTenantIds: vi.fn(),
  getTenantRelation: vi.fn(),
  tenantsAreAllied: vi.fn(),
}))

vi.mock('@torcida/types', () => ({
  saoRivais: vi.fn(),
}))

import { getPerfilPrivadoEfetivoDoAlvo } from '@/lib/social'

const tenantSocio = {
  id: 'tenant-gavioes',
  nome: 'Gaviões',
  slug: 'pde-gavioes-fiel',
  sintetico: false,
  ativo: true,
}

describe('getPerfilPrivadoEfetivoDoAlvo', () => {
  beforeEach(() => {
    findUniquePerfilMembro.mockReset()
    findUniqueSaas.mockReset()
    resolvePerfilTenantForUser.mockReset()
  })

  it('sócio privado exige aprovação mesmo quando o viewer está em outro contexto (CN)', async () => {
    resolvePerfilTenantForUser.mockResolvedValue(tenantSocio)
    findUniquePerfilMembro.mockResolvedValue({ perfilPrivado: true })
    findUniqueSaas.mockResolvedValue({ tipo: 'SOCIO', status: 'APROVADO' })

    const result = await getPerfilPrivadoEfetivoDoAlvo('user-socio', 'user-torcedor-cn')

    expect(result).toEqual({ perfilPrivado: true, tenantIdAlvo: tenantSocio.id })
    expect(resolvePerfilTenantForUser).toHaveBeenCalledWith('user-socio', 'user-torcedor-cn')
    expect(findUniquePerfilMembro).toHaveBeenCalledWith({
      where: { userId_tenantId: { userId: 'user-socio', tenantId: tenantSocio.id } },
      select: { perfilPrivado: true },
    })
  })

  it('sócio sem PerfilMembro gravado defaulta privado', async () => {
    resolvePerfilTenantForUser.mockResolvedValue(tenantSocio)
    findUniquePerfilMembro.mockResolvedValue(null)
    findUniqueSaas.mockResolvedValue({ tipo: 'SOCIO', status: 'APROVADO' })

    const result = await getPerfilPrivadoEfetivoDoAlvo('user-socio', 'viewer')

    expect(result.perfilPrivado).toBe(true)
  })

  it('perfil público do sócio permite follow instantâneo', async () => {
    resolvePerfilTenantForUser.mockResolvedValue(tenantSocio)
    findUniquePerfilMembro.mockResolvedValue({ perfilPrivado: false })
    findUniqueSaas.mockResolvedValue({ tipo: 'SOCIO', status: 'APROVADO' })

    const result = await getPerfilPrivadoEfetivoDoAlvo('user-socio', 'viewer')

    expect(result.perfilPrivado).toBe(false)
  })

  it('sem tenant do alvo: fail-closed (exige aprovação)', async () => {
    resolvePerfilTenantForUser.mockResolvedValue(null)

    const result = await getPerfilPrivadoEfetivoDoAlvo('user-alvo', 'viewer')

    expect(result).toEqual({ perfilPrivado: true, tenantIdAlvo: null })
    expect(findUniquePerfilMembro).not.toHaveBeenCalled()
  })
})
