import { beforeEach, describe, expect, it, vi } from 'vitest'
import { canViewRecurso, ordenarPar, resolveVisibility, saoRivais, SENSIBILIDADE } from '@torcida/types'

const findMany = vi.hoisted(() => vi.fn())
const getAlliedTenantIds = vi.hoisted(() => vi.fn())
const getTenantRelation = vi.hoisted(() => vi.fn())
const tenantsAreAllied = vi.hoisted(() => vi.fn())

vi.mock('@torcida/db', () => ({
  db: { saasMembro: { findMany }, seguimento: { findUnique: vi.fn() }, perfilMembro: { upsert: vi.fn() } },
}))

vi.mock('@/lib/hierarquia', () => ({
  getAlliedTenantIds,
  getTenantRelation,
  tenantsAreAllied,
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
    getAlliedTenantIds.mockReset()
    getTenantRelation.mockReset()
    tenantsAreAllied.mockReset()
    getAlliedTenantIds.mockResolvedValue(['t2'])
    tenantsAreAllied.mockResolvedValue(true)
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
})
