import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  notificacaoFindFirst: vi.fn(),
  notificacaoFindMany: vi.fn(),
  notificacaoUpdateMany: vi.fn(),
  authFn: vi.fn(),
  getTenantFromHostFn: vi.fn(),
  emitNotificacaoPing: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@torcida/db', () => ({
  db: {
    notificacao: {
      findFirst: mocks.notificacaoFindFirst,
      findMany: mocks.notificacaoFindMany,
      updateMany: mocks.notificacaoUpdateMany,
    },
  },
}))

vi.mock('@/lib/auth', () => ({ auth: mocks.authFn }))
vi.mock('@/lib/tenant', () => ({ getTenantFromHost: mocks.getTenantFromHostFn }))
vi.mock('@/lib/notificacoes-bus', () => ({ emitNotificacaoPing: mocks.emitNotificacaoPing }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

import {
  marcarNotificacaoLida,
  marcarNotificacoesLidasPorIds,
  marcarTodasNotificacoesAdminLidas,
  marcarTodasNotificacoesLidas,
} from '@/app/actions/notificacoes'
import { TIPOS_NOTIFICACAO_ADMIN } from '@/lib/notificacoes-comunidade'

const SESSION = { user: { id: 'user-1' } }
const TENANT = { id: 'tenant-1' }
const TIPO_SOCIAL = 'MENCAO' as const
const TIPO_ADMIN = TIPOS_NOTIFICACAO_ADMIN[0]

beforeEach(() => {
  vi.clearAllMocks()
  mocks.authFn.mockResolvedValue(SESSION)
  mocks.getTenantFromHostFn.mockResolvedValue(TENANT)
})

describe('marcarNotificacaoLida', () => {
  it('lança erro sem sessão', async () => {
    mocks.authFn.mockResolvedValue(null)
    await expect(marcarNotificacaoLida('notif-1')).rejects.toThrow('Não autenticado')
    expect(mocks.notificacaoUpdateMany).not.toHaveBeenCalled()
  })

  it('lança erro sem tenant', async () => {
    mocks.getTenantFromHostFn.mockResolvedValue(null)
    await expect(marcarNotificacaoLida('notif-1')).rejects.toThrow('Tenant não encontrado')
    expect(mocks.notificacaoUpdateMany).not.toHaveBeenCalled()
  })

  it('atualiza escopado a id+tenantId+userId, emite ping e revalida o lado portal quando o tipo é social', async () => {
    mocks.notificacaoFindFirst.mockResolvedValue({ tipo: TIPO_SOCIAL })

    await marcarNotificacaoLida('notif-1')

    expect(mocks.notificacaoUpdateMany).toHaveBeenCalledWith({
      where: { id: 'notif-1', tenantId: TENANT.id, userId: SESSION.user.id },
      data: { lida: true },
    })
    expect(mocks.emitNotificacaoPing).toHaveBeenCalledWith(TENANT.id, SESSION.user.id)
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/portal/comunidade/notificacoes')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/portal')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/portal/comunidade')
    expect(mocks.revalidatePath).not.toHaveBeenCalledWith('/admin')
  })

  it('revalida o lado admin quando o tipo está em TIPOS_NOTIFICACAO_ADMIN', async () => {
    mocks.notificacaoFindFirst.mockResolvedValue({ tipo: TIPO_ADMIN })

    await marcarNotificacaoLida('notif-2')

    expect(mocks.revalidatePath).toHaveBeenCalledWith('/portal/comunidade/notificacoes')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/notificacoes')
    expect(mocks.revalidatePath).not.toHaveBeenCalledWith('/portal')
  })

  it('não faz nada quando a notificação não existe para o usuário/tenant', async () => {
    mocks.notificacaoFindFirst.mockResolvedValue(null)

    await marcarNotificacaoLida('notif-inexistente')

    expect(mocks.notificacaoUpdateMany).not.toHaveBeenCalled()
    expect(mocks.emitNotificacaoPing).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})

describe('marcarNotificacoesLidasPorIds', () => {
  it('retorna cedo com lista vazia, sem tocar no banco', async () => {
    await marcarNotificacoesLidasPorIds([])

    expect(mocks.authFn).not.toHaveBeenCalled()
    expect(mocks.notificacaoUpdateMany).not.toHaveBeenCalled()
  })

  it('retorna cedo quando nenhuma notificação do lote pertence ao usuário/tenant', async () => {
    mocks.notificacaoFindMany.mockResolvedValue([])

    await marcarNotificacoesLidasPorIds(['a', 'b'])

    expect(mocks.notificacaoUpdateMany).not.toHaveBeenCalled()
    expect(mocks.emitNotificacaoPing).not.toHaveBeenCalled()
  })

  it('revalida os dois lados e emite ping uma vez quando o lote mistura tipos admin+portal', async () => {
    mocks.notificacaoFindMany.mockResolvedValue([{ tipo: TIPO_SOCIAL }, { tipo: TIPO_ADMIN }])

    await marcarNotificacoesLidasPorIds(['a', 'b'])

    expect(mocks.notificacaoUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ['a', 'b'] }, tenantId: TENANT.id, userId: SESSION.user.id },
      data: { lida: true },
    })
    expect(mocks.emitNotificacaoPing).toHaveBeenCalledTimes(1)
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/portal/comunidade/notificacoes')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/notificacoes')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/portal')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/portal/comunidade')
  })
})

describe('marcarTodasNotificacoesLidas / marcarTodasNotificacoesAdminLidas', () => {
  it('marcarTodasNotificacoesLidas atualiza sem filtro de tipo e emite ping só quando há linhas afetadas', async () => {
    mocks.notificacaoUpdateMany.mockResolvedValue({ count: 0 })

    await marcarTodasNotificacoesLidas()

    expect(mocks.notificacaoUpdateMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT.id, userId: SESSION.user.id, lida: false },
      data: { lida: true },
    })
    expect(mocks.emitNotificacaoPing).not.toHaveBeenCalled()
  })

  it('marcarTodasNotificacoesLidas emite ping e revalida os dois lados quando afeta linhas', async () => {
    mocks.notificacaoUpdateMany.mockResolvedValue({ count: 3 })

    await marcarTodasNotificacoesLidas()

    expect(mocks.emitNotificacaoPing).toHaveBeenCalledWith(TENANT.id, SESSION.user.id)
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/portal')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin')
  })

  it('marcarTodasNotificacoesAdminLidas filtra por TIPOS_NOTIFICACAO_ADMIN e revalida só o lado admin', async () => {
    mocks.notificacaoUpdateMany.mockResolvedValue({ count: 2 })

    await marcarTodasNotificacoesAdminLidas()

    expect(mocks.notificacaoUpdateMany).toHaveBeenCalledWith({
      where: {
        tenantId: TENANT.id,
        userId: SESSION.user.id,
        lida: false,
        tipo: { in: TIPOS_NOTIFICACAO_ADMIN },
      },
      data: { lida: true },
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/notificacoes')
    expect(mocks.revalidatePath).not.toHaveBeenCalledWith('/portal')
  })
})
