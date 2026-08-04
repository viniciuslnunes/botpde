import { beforeEach, describe, expect, it, vi } from 'vitest'

const userRoleFindFirst = vi.hoisted(() => vi.fn())
const tenantFindUnique = vi.hoisted(() => vi.fn())

vi.mock('@torcida/db', () => ({
  db: {
    userRole: { findFirst: userRoleFindFirst },
    tenant: { findUnique: tenantFindUnique },
  },
}))

// `React.cache` memoiza por render — nos testes queremos cada chamada crua.
vi.mock('react', () => ({ cache: <T,>(fn: T) => fn }))

const COM_OWNER = { id: 'user-role-1' }

async function estado(tenantId: string) {
  const { getEstadoSuportePlataforma } = await import('@/lib/suporte-plataforma')
  return getEstadoSuportePlataforma(tenantId)
}

describe('suporte da plataforma — quando o super-admin pode operar', () => {
  beforeEach(() => {
    userRoleFindFirst.mockReset()
    tenantFindUnique.mockReset()
    vi.resetModules()
  })

  it('unidade sem liderança: super-admin opera mesmo sem consentimento', async () => {
    userRoleFindFirst.mockResolvedValue(null)
    tenantFindUnique.mockResolvedValue({ suportePlataforma: false })

    expect(await estado('unidade-nova')).toEqual({
      temLideranca: false,
      consentido: false,
      superAdminPodeOperar: true,
    })
  })

  it('unidade com liderança e sem consentimento: super-admin NÃO opera', async () => {
    userRoleFindFirst.mockResolvedValue(COM_OWNER)
    tenantFindUnique.mockResolvedValue({ suportePlataforma: false })

    expect(await estado('unidade-com-presidente')).toEqual({
      temLideranca: true,
      consentido: false,
      superAdminPodeOperar: false,
    })
  })

  it('unidade com liderança que liberou o suporte: super-admin opera', async () => {
    userRoleFindFirst.mockResolvedValue(COM_OWNER)
    tenantFindUnique.mockResolvedValue({ suportePlataforma: true })

    expect(await estado('unidade-que-pediu-ajuda')).toEqual({
      temLideranca: true,
      consentido: true,
      superAdminPodeOperar: true,
    })
  })

  it('tenant inexistente não vira consentimento implícito', async () => {
    userRoleFindFirst.mockResolvedValue(COM_OWNER)
    tenantFindUnique.mockResolvedValue(null)

    const resultado = await estado('sumiu')
    expect(resultado.consentido).toBe(false)
    expect(resultado.superAdminPodeOperar).toBe(false)
  })

  it('a chave é lida do tenant recebido — nunca da Sede', async () => {
    userRoleFindFirst.mockResolvedValue(COM_OWNER)
    tenantFindUnique.mockResolvedValue({ suportePlataforma: false })

    await estado('pde-filho')

    expect(tenantFindUnique).toHaveBeenCalledWith({
      where: { id: 'pde-filho' },
      select: { suportePlataforma: true },
    })
    expect(userRoleFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: 'pde-filho' }) }),
    )
  })
})
