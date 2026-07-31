import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Achado 10 — o fan-out cria N notificações e a reconciliação marcava só a de
 * quem clicou, deixando N-1 badges presos apontando para um pedido/denúncia
 * que já não existe. O invariante testado aqui é o `where`: NUNCA escopado por
 * destinatário, e um ping por destinatário afetado.
 */
const mocks = vi.hoisted(() => ({
  notificacaoFindMany: vi.fn(),
  notificacaoUpdateMany: vi.fn(),
  emitNotificacaoPing: vi.fn(),
}))

vi.mock('@torcida/db', () => ({
  db: {
    notificacao: {
      findMany: mocks.notificacaoFindMany,
      updateMany: mocks.notificacaoUpdateMany,
    },
  },
}))

vi.mock('@/lib/notificacoes-bus', () => ({
  emitNotificacaoPing: mocks.emitNotificacaoPing,
}))

import { reconciliarNotificacoesDoEvento } from '@/lib/notificacoes'

const TENANT = 'tenant-1'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('reconciliarNotificacoesDoEvento', () => {
  it('não escopa por destinatário e pinga cada um dos N moderadores', async () => {
    mocks.notificacaoFindMany.mockResolvedValue([
      { userId: 'mod-1' },
      { userId: 'mod-2' },
      { userId: 'mod-3' },
    ])
    mocks.notificacaoUpdateMany.mockResolvedValue({ count: 3 })

    const count = await reconciliarNotificacoesDoEvento(TENANT, {
      tipo: 'DENUNCIA_NOVA',
      atorId: 'denunciante-1',
      corpo: 'spam',
    })

    expect(count).toBe(3)

    const where = mocks.notificacaoUpdateMany.mock.calls[0][0].where
    expect(where).not.toHaveProperty('userId')
    expect(where).toMatchObject({
      tenantId: TENANT,
      tipo: 'DENUNCIA_NOVA',
      atorId: 'denunciante-1',
      corpo: 'spam',
      lida: false,
    })

    expect(mocks.emitNotificacaoPing).toHaveBeenCalledTimes(3)
    for (const userId of ['mod-1', 'mod-2', 'mod-3']) {
      expect(mocks.emitNotificacaoPing).toHaveBeenCalledWith(TENANT, userId)
    }
  })

  it('lê os destinatários ANTES do update — depois dele nada casa com lida: false', async () => {
    const ordem: string[] = []
    mocks.notificacaoFindMany.mockImplementation(async () => {
      ordem.push('findMany')
      return [{ userId: 'admin-1' }]
    })
    mocks.notificacaoUpdateMany.mockImplementation(async () => {
      ordem.push('updateMany')
      return { count: 1 }
    })

    await reconciliarNotificacoesDoEvento(TENANT, {
      tipo: 'GRUPO_PEDIDO',
      atorId: 'solicitante-1',
    })

    expect(ordem).toEqual(['findMany', 'updateMany'])
  })

  it('omite `corpo` do filtro quando o critério não o informa', async () => {
    mocks.notificacaoFindMany.mockResolvedValue([{ userId: 'admin-1' }])
    mocks.notificacaoUpdateMany.mockResolvedValue({ count: 1 })

    await reconciliarNotificacoesDoEvento(TENANT, {
      tipo: 'MEMBRO_SOLICITADO',
      atorId: 'solicitante-1',
    })

    const where = mocks.notificacaoUpdateMany.mock.calls[0][0].where
    expect(where).not.toHaveProperty('corpo')
  })

  it('não toca no banco nem pinga quando ninguém tem a notificação pendente', async () => {
    mocks.notificacaoFindMany.mockResolvedValue([])

    const count = await reconciliarNotificacoesDoEvento(TENANT, { tipo: 'CANAL_PEDIDO' })

    expect(count).toBe(0)
    expect(mocks.notificacaoUpdateMany).not.toHaveBeenCalled()
    expect(mocks.emitNotificacaoPing).not.toHaveBeenCalled()
  })
})
