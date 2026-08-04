import { beforeEach, describe, expect, it, vi } from 'vitest'

const userRoleFindMany = vi.hoisted(() => vi.fn())
const tenantFindUnique = vi.hoisted(() => vi.fn())
const isSuperAdminEmail = vi.hoisted(() => vi.fn((email: string | null | undefined) => email === 'sa@plataforma.app'))

vi.mock('@torcida/db', () => ({
  db: {
    userRole: { findMany: userRoleFindMany },
    tenant: { findUnique: tenantFindUnique },
  },
}))

vi.mock('@/lib/tenant-context', () => ({
  isSuperAdminEmail: (email: string | null | undefined) => isSuperAdminEmail(email),
}))

// `React.cache` memoiza por render — nos testes queremos cada chamada crua.
vi.mock('react', () => ({ cache: <T,>(fn: T) => fn }))

const PRESIDENTE = [{ user: { email: 'presidente@torcida.app' } }]
const OWNER_TECNICO_SA = [{ user: { email: 'sa@plataforma.app' } }]

async function estado(tenantId: string) {
  const { getEstadoSuportePlataforma } = await import('@/lib/suporte-plataforma')
  return getEstadoSuportePlataforma(tenantId)
}

describe('suporte da plataforma — quando o super-admin pode operar', () => {
  beforeEach(() => {
    userRoleFindMany.mockReset()
    tenantFindUnique.mockReset()
    isSuperAdminEmail.mockClear()
    vi.resetModules()
  })

  it('unidade sem liderança: super-admin opera mesmo sem consentimento', async () => {
    userRoleFindMany.mockResolvedValue([])
    tenantFindUnique.mockResolvedValue({ suportePlataforma: false })

    expect(await estado('unidade-nova')).toEqual({
      temLideranca: false,
      consentido: false,
      superAdminPodeOperar: true,
    })
  })

  it('só owner técnico do setup (SA): não conta como liderança — SA opera sem consentimento', async () => {
    userRoleFindMany.mockResolvedValue(OWNER_TECNICO_SA)
    tenantFindUnique.mockResolvedValue({ suportePlataforma: false })

    expect(await estado('torcida-recem-criada')).toEqual({
      temLideranca: false,
      consentido: false,
      superAdminPodeOperar: true,
    })
  })

  it('unidade com liderança e sem consentimento: super-admin NÃO opera', async () => {
    userRoleFindMany.mockResolvedValue(PRESIDENTE)
    tenantFindUnique.mockResolvedValue({ suportePlataforma: false })

    expect(await estado('unidade-com-presidente')).toEqual({
      temLideranca: true,
      consentido: false,
      superAdminPodeOperar: false,
    })
  })

  it('unidade com liderança que liberou o suporte: super-admin opera', async () => {
    userRoleFindMany.mockResolvedValue(PRESIDENTE)
    tenantFindUnique.mockResolvedValue({ suportePlataforma: true })

    expect(await estado('unidade-que-pediu-ajuda')).toEqual({
      temLideranca: true,
      consentido: true,
      superAdminPodeOperar: true,
    })
  })

  it('tenant inexistente não vira consentimento implícito', async () => {
    userRoleFindMany.mockResolvedValue(PRESIDENTE)
    tenantFindUnique.mockResolvedValue(null)

    const resultado = await estado('sumiu')
    expect(resultado.consentido).toBe(false)
    expect(resultado.superAdminPodeOperar).toBe(false)
  })

  it('a chave é lida do tenant recebido — nunca da Sede', async () => {
    userRoleFindMany.mockResolvedValue(PRESIDENTE)
    tenantFindUnique.mockResolvedValue({ suportePlataforma: false })

    await estado('pde-filho')

    expect(tenantFindUnique).toHaveBeenCalledWith({
      where: { id: 'pde-filho' },
      select: { suportePlataforma: true },
    })
    expect(userRoleFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: 'pde-filho' }) }),
    )
  })
})
