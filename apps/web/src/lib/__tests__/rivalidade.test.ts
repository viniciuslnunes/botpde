import { beforeEach, describe, expect, it, vi } from 'vitest'
import { canViewRecurso, ordenarPar, resolveVisibility, saoRivais, SENSIBILIDADE } from '@torcida/types'

const findMany = vi.hoisted(() => vi.fn())
const userRoleFindMany = vi.hoisted(() => vi.fn())
const perfilTorcedorFindUnique = vi.hoisted(() => vi.fn())
const getAlliedTenantIds = vi.hoisted(() => vi.fn())
const getTenantRelation = vi.hoisted(() => vi.fn())
const tenantsAreAllied = vi.hoisted(() => vi.fn())
const getTenantIdsPorAfiliacao = vi.hoisted(() => vi.fn())

vi.mock('@torcida/db', () => ({
  db: {
    saasMembro: { findMany },
    userRole: { findMany: userRoleFindMany },
    seguimento: { findUnique: vi.fn() },
    perfilMembro: { upsert: vi.fn() },
    perfilTorcedor: { findUnique: perfilTorcedorFindUnique },
  },
}))

vi.mock('@/lib/hierarquia', () => ({
  getAlliedTenantIds,
  getTenantRelation,
  tenantsAreAllied,
}))

vi.mock('@/lib/comunidade-contexto', () => ({
  getTenantIdsPorAfiliacao,
}))

import { canFollowUser } from '@/lib/social'

// ─── Regras puras (packages/types) ───────────────────────────────────────────

describe('ordenarPar (invariante canônico aId < bId)', () => {
  it('mantém a ordem quando já canônica', () => {
    expect(ordenarPar('aaa', 'bbb')).toEqual(['aaa', 'bbb'])
  })

  it('inverte quando fora de ordem', () => {
    expect(ordenarPar('bbb', 'aaa')).toEqual(['aaa', 'bbb'])
  })
})

describe('saoRivais', () => {
  it('true apenas para relation rival', () => {
    expect(saoRivais('rival')).toBe(true)
    expect(saoRivais('allied')).toBe(false)
    expect(saoRivais('self')).toBe(false)
    expect(saoRivais('unrelated')).toBe(false)
  })
})

describe('resolveVisibility com relation rival', () => {
  it('rival nunca vê nada — nem recurso público', () => {
    expect(resolveVisibility('rival', SENSIBILIDADE.PUBLICO)).toBe(false)
    expect(resolveVisibility('rival', SENSIBILIDADE.RESTRITO)).toBe(false)
  })

  it('canViewRecurso nega tudo para rival', () => {
    expect(canViewRecurso('rival', 'loja')).toBe(false)
    expect(canViewRecurso('rival', 'comunidade')).toBe(false)
    expect(canViewRecurso('rival', 'membros')).toBe(false)
  })
})

// ─── Funil social: canFollowUser ─────────────────────────────────────────────

type Vinculo = { userId: string; tenantId: string; tipo: 'SOCIO' | 'TORCEDOR' }

describe('canFollowUser × rivalidade', () => {
  beforeEach(() => {
    findMany.mockReset()
    userRoleFindMany.mockReset()
    userRoleFindMany.mockResolvedValue([])
    perfilTorcedorFindUnique.mockReset()
    getAlliedTenantIds.mockReset()
    getTenantRelation.mockReset()
    tenantsAreAllied.mockReset()
    getTenantIdsPorAfiliacao.mockReset()
    getAlliedTenantIds.mockResolvedValue(['t2'])
    tenantsAreAllied.mockResolvedValue(true)
    perfilTorcedorFindUnique.mockResolvedValue(null)
  })

  function mockVinculos(vinculos: Vinculo[]) {
    findMany.mockResolvedValue(vinculos)
  }

  it('sócio×sócio de torcidas rivais → bloqueado', async () => {
    mockVinculos([
      { userId: 'u1', tenantId: 't1', tipo: 'SOCIO' },
      { userId: 'u2', tenantId: 't2', tipo: 'SOCIO' },
    ])
    getTenantRelation.mockResolvedValue('rival')
    await expect(canFollowUser('u1', 'u2', 't1')).resolves.toBe(false)
    expect(getTenantRelation).toHaveBeenCalledWith('t1', 't2')
  })

  it('torcedor×sócio de torcidas rivais → passa livre', async () => {
    mockVinculos([
      { userId: 'u1', tenantId: 't1', tipo: 'TORCEDOR' },
      { userId: 'u2', tenantId: 't2', tipo: 'SOCIO' },
    ])
    getTenantRelation.mockResolvedValue('rival')
    await expect(canFollowUser('u1', 'u2', 't1')).resolves.toBe(true)
    // Nenhum par sócio×sócio → rivalidade nem é consultada
    expect(getTenantRelation).not.toHaveBeenCalled()
  })

  it('sócio×sócio de torcidas aliadas → permitido', async () => {
    mockVinculos([
      { userId: 'u1', tenantId: 't1', tipo: 'SOCIO' },
      { userId: 'u2', tenantId: 't2', tipo: 'SOCIO' },
    ])
    getTenantRelation.mockResolvedValue('allied')
    await expect(canFollowUser('u1', 'u2', 't1')).resolves.toBe(true)
  })

  it('sócio×sócio do mesmo tenant → permitido (rivalidade não se aplica)', async () => {
    mockVinculos([
      { userId: 'u1', tenantId: 't1', tipo: 'SOCIO' },
      { userId: 'u2', tenantId: 't1', tipo: 'SOCIO' },
    ])
    await expect(canFollowUser('u1', 'u2', 't1')).resolves.toBe(true)
    expect(getTenantRelation).not.toHaveBeenCalled()
  })

  it('seguir a si mesmo continua bloqueado', async () => {
    await expect(canFollowUser('u1', 'u1', 't1')).resolves.toBe(false)
    expect(findMany).not.toHaveBeenCalled()
  })

  it('torcedor global (sem SaasMembro) segue sócio de torcida do mesmo clube', async () => {
    mockVinculos([{ userId: 'u2', tenantId: 't1', tipo: 'SOCIO' }])
    perfilTorcedorFindUnique.mockResolvedValue({ afiliacaoId: 'af1' })
    getTenantIdsPorAfiliacao.mockResolvedValue(['t1', 't9'])
    await expect(canFollowUser('u1', 'u2', null)).resolves.toBe(true)
    // Torcedor global não entra no bloqueio de rivalidade (não é sócio)
    expect(getTenantRelation).not.toHaveBeenCalled()
  })

  it('torcedor global não segue sócio de torcida de outro clube', async () => {
    mockVinculos([{ userId: 'u2', tenantId: 't5', tipo: 'SOCIO' }])
    perfilTorcedorFindUnique.mockResolvedValue({ afiliacaoId: 'af1' })
    getTenantIdsPorAfiliacao.mockResolvedValue(['t1', 't9'])
    tenantsAreAllied.mockResolvedValue(false)
    await expect(canFollowUser('u1', 'u2', null)).resolves.toBe(false)
  })

  it('usuário sem vínculo e sem PerfilTorcedor não segue ninguém', async () => {
    mockVinculos([{ userId: 'u2', tenantId: 't1', tipo: 'SOCIO' }])
    perfilTorcedorFindUnique.mockResolvedValue(null)
    await expect(canFollowUser('u1', 'u2', null)).resolves.toBe(false)
  })
})
