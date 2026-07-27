import { beforeEach, describe, expect, it, vi } from 'vitest'

const findUnique = vi.fn()
const emitPing = vi.fn()
const getOrCreateCn = vi.fn()

vi.mock('@torcida/db', () => ({
  db: {
    tenant: { findUnique: (...args: unknown[]) => findUnique(...args) },
  },
}))

vi.mock('@/lib/notificacoes-bus', () => ({
  emitNotificacaoPing: (...args: unknown[]) => emitPing(...args),
}))

vi.mock('@/lib/comunidade-contexto', () => ({
  getOrCreateComunidadeNacionalTenant: (...args: unknown[]) => getOrCreateCn(...args),
}))

vi.mock('@/lib/notificacoes-menu-badges', () => ({
  agregarBadgesPorMenu: () => ({}),
}))

vi.mock('@/lib/env', () => ({
  superAdminEmails: [],
}))

describe('whereInboxPortal / emitNotificacaoPingCnDoSolicitante', () => {
  beforeEach(() => {
    findUnique.mockReset()
    emitPing.mockReset()
    getOrCreateCn.mockReset()
  })

  it('whereInboxPortal em tenant sintético inclui decisões de admissão do clube', async () => {
    findUnique.mockResolvedValue({ sintetico: true, afiliacaoId: 'af1' })
    const { whereInboxPortal } = await import('@/lib/notificacoes')
    const where = await whereInboxPortal('cn-sintetico', 'u1', [
      'MENCAO',
      'MEMBRO_APROVADO',
      'MEMBRO_REPROVADO',
    ])
    expect(where).toMatchObject({
      userId: 'u1',
      OR: [
        { tenantId: 'cn-sintetico' },
        {
          tipo: { in: ['MEMBRO_APROVADO', 'MEMBRO_REPROVADO'] },
          tenant: { afiliacaoId: 'af1', sintetico: false, ativo: true },
        },
      ],
    })
  })

  it('whereInboxPortal em torcida real filtra só pelo tenantId', async () => {
    findUnique.mockResolvedValue({ sintetico: false, afiliacaoId: 'af1' })
    const { whereInboxPortal } = await import('@/lib/notificacoes')
    const where = await whereInboxPortal('torcida-1', 'u1', ['MEMBRO_APROVADO'])
    expect(where).toEqual({
      userId: 'u1',
      tipo: { in: ['MEMBRO_APROVADO'] },
      tenantId: 'torcida-1',
    })
  })

  it('emitNotificacaoPingCnDoSolicitante pinga o tenant sintético da CN', async () => {
    findUnique.mockResolvedValue({ afiliacaoId: 'af1', sintetico: false })
    getOrCreateCn.mockResolvedValue({ id: 'cn-sintetico' })
    const { emitNotificacaoPingCnDoSolicitante } = await import('@/lib/notificacoes')
    await emitNotificacaoPingCnDoSolicitante('torcida-1', 'u1')
    expect(getOrCreateCn).toHaveBeenCalledWith('af1')
    expect(emitPing).toHaveBeenCalledWith('cn-sintetico', 'u1')
  })
})
