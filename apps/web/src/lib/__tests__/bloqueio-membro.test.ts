import { beforeEach, describe, expect, it, vi } from 'vitest'

// `estaBloqueadoNoTenant` consulta `db` direto (é leitura, não recebe client).
const membroBloqueioFindFirst = vi.hoisted(() => vi.fn())
vi.mock('@torcida/db', () => ({
  db: { membroBloqueio: { findFirst: membroBloqueioFindFirst } },
  Prisma: { join: vi.fn(), sql: vi.fn(), empty: null },
}))

// Ancestrais do tenant — resolvidos por banco em runtime.
const getAncestorTenantIdsFn = vi.hoisted(() => vi.fn(async () => [] as string[]))
vi.mock('@/lib/hierarquia', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getAncestorTenantIds: getAncestorTenantIdsFn,
}))

import { estaBloqueadoNoTenant } from '@/lib/membros-sede'

const SEDE = 'tenant-sede'
const PDE = 'tenant-pde'
const USER = 'user-1'

/**
 * Reproduz em memória o `where` da consulta: casa userId e tenant dentro do
 * escopo pedido. Assim o teste valida o ESCOPO montado, não o Prisma.
 */
function bloqueiosNoBanco(linhas: { userId: string; tenantId: string }[]) {
  membroBloqueioFindFirst.mockImplementation(
    async (args: { where: { userId: string; tenantId: { in: string[] } } }) => {
      const achou = linhas.find(
        (l) => l.userId === args.where.userId && args.where.tenantId.in.includes(l.tenantId),
      )
      return achou ? { id: 'bloqueio-1' } : null
    },
  )
}

describe('estaBloqueadoNoTenant — escopo herdado', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getAncestorTenantIdsFn.mockResolvedValue([])
  })

  it('bloqueio no próprio tenant barra', async () => {
    bloqueiosNoBanco([{ userId: USER, tenantId: PDE }])
    expect(await estaBloqueadoNoTenant(USER, PDE)).toBe(true)
  })

  it('bloqueio na Sede herda para a unidade abaixo', async () => {
    getAncestorTenantIdsFn.mockResolvedValue([SEDE])
    bloqueiosNoBanco([{ userId: USER, tenantId: SEDE }])
    expect(await estaBloqueadoNoTenant(USER, PDE)).toBe(true)
  })

  it('bloqueio numa unidade NÃO sobe para a Sede', async () => {
    // Consultando a Sede: o PDE não é ancestral dela, então fica fora do escopo.
    getAncestorTenantIdsFn.mockResolvedValue([])
    bloqueiosNoBanco([{ userId: USER, tenantId: PDE }])
    expect(await estaBloqueadoNoTenant(USER, SEDE)).toBe(false)
  })

  it('sem bloqueio, passa', async () => {
    getAncestorTenantIdsFn.mockResolvedValue([SEDE])
    bloqueiosNoBanco([])
    expect(await estaBloqueadoNoTenant(USER, PDE)).toBe(false)
  })

  it('bloqueio de outro usuário não afeta este', async () => {
    bloqueiosNoBanco([{ userId: 'user-2', tenantId: PDE }])
    expect(await estaBloqueadoNoTenant(USER, PDE)).toBe(false)
  })
})
