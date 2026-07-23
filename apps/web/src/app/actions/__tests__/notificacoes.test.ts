import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  notificacaoFindFirst: vi.fn(),
  notificacaoFindMany: vi.fn(),
  notificacaoUpdateMany: vi.fn(),
  authFn: vi.fn(),
  getTenantFromHostFn: vi.fn(),
  resolveTenantIdPortalComunidadeFn: vi.fn(),
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
vi.mock('@/lib/comunidade-contexto', () => ({
  resolveTenantIdPortalComunidade: mocks.resolveTenantIdPortalComunidadeFn,
}))
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
  mocks.resolveTenantIdPortalComunidadeFn.mockResolvedValue(TENANT.id)
})

describe('marcarNotificacaoLida', () => {
  it('lança erro sem sessão', async () => {
    mocks.authFn.mockResolvedValue(null)
    await expect(marcarNotificacaoLida('notif-1')).rejects.toThrow('Não autenticado')
    expect(mocks.notificacaoUpdateMany).not.toHaveBeenCalled()
  })

  it('atualiza escopado a id+userId (dono), sem depender do host', async () => {
    mocks.notificacaoFindFirst.mockResolvedValue({ tipo: TIPO_SOCIAL, tenantId: TENANT.id })

    await marcarNotificacaoLida('notif-1')

    expect(mocks.getTenantFromHostFn).not.toHaveBeenCalled()
    expect(mocks.notificacaoFindFirst).toHaveBeenCalledWith({
      where: { id: 'notif-1', userId: SESSION.user.id },
      select: { tipo: true, tenantId: true },
    })
    expect(mocks.notificacaoUpdateMany).toHaveBeenCalledWith({
      where: { id: 'notif-1', userId: SESSION.user.id },
      data: { lida: true },
    })
    expect(mocks.emitNotificacaoPing).toHaveBeenCalledWith(TENANT.id, SESSION.user.id)
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/portal/comunidade/notificacoes')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/portal')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/portal/comunidade')
    expect(mocks.revalidatePath).not.toHaveBeenCalledWith('/admin')
  })

  it('revalida o lado admin quando o tipo está em TIPOS_NOTIFICACAO_ADMIN', async () => {
    mocks.notificacaoFindFirst.mockResolvedValue({ tipo: TIPO_ADMIN, tenantId: TENANT.id })

    await marcarNotificacaoLida('notif-2')

    expect(mocks.revalidatePath).toHaveBeenCalledWith('/portal/comunidade/notificacoes')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/notificacoes')
    expect(mocks.revalidatePath).not.toHaveBeenCalledWith('/portal')
  })

  it('não faz nada quando a notificação não existe para o usuário', async () => {
    mocks.notificacaoFindFirst.mockResolvedValue(null)

    await marcarNotificacaoLida('notif-inexistente')

    expect(mocks.notificacaoUpdateMany).not.toHaveBeenCalled()
    expect(mocks.emitNotificacaoPing).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('pinga o tenantId da própria notificação (pode divergir do host)', async () => {
    mocks.notificacaoFindFirst.mockResolvedValue({
      tipo: TIPO_SOCIAL,
      tenantId: 'tenant-sintetico-cn',
    })

    await marcarNotificacaoLida('notif-cn')

    expect(mocks.emitNotificacaoPing).toHaveBeenCalledWith('tenant-sintetico-cn', SESSION.user.id)
  })
})

describe('marcarNotificacoesLidasPorIds', () => {
  it('retorna cedo com lista vazia, sem tocar no banco', async () => {
    await marcarNotificacoesLidasPorIds([])

    expect(mocks.authFn).not.toHaveBeenCalled()
    expect(mocks.notificacaoUpdateMany).not.toHaveBeenCalled()
  })

  it('retorna cedo quando nenhuma notificação do lote pertence ao usuário', async () => {
    mocks.notificacaoFindMany.mockResolvedValue([])

    await marcarNotificacoesLidasPorIds(['a', 'b'])

    expect(mocks.notificacaoUpdateMany).not.toHaveBeenCalled()
    expect(mocks.emitNotificacaoPing).not.toHaveBeenCalled()
  })

  it('revalida os dois lados e emite ping por tenant quando o lote mistura tipos', async () => {
    mocks.notificacaoFindMany.mockResolvedValue([
      { tipo: TIPO_SOCIAL, tenantId: TENANT.id },
      { tipo: TIPO_ADMIN, tenantId: TENANT.id },
    ])

    await marcarNotificacoesLidasPorIds(['a', 'b'])

    expect(mocks.getTenantFromHostFn).not.toHaveBeenCalled()
    expect(mocks.notificacaoUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ['a', 'b'] }, userId: SESSION.user.id },
      data: { lida: true },
    })
    expect(mocks.emitNotificacaoPing).toHaveBeenCalledTimes(1)
    expect(mocks.emitNotificacaoPing).toHaveBeenCalledWith(TENANT.id, SESSION.user.id)
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/portal/comunidade/notificacoes')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/notificacoes')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/portal')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/portal/comunidade')
  })
})

describe('marcarTodasNotificacoesLidas / marcarTodasNotificacoesAdminLidas', () => {
  it('marcarTodasNotificacoesLidas usa resolveTenantIdPortalComunidade e não emite ping sem linhas', async () => {
    mocks.notificacaoUpdateMany.mockResolvedValue({ count: 0 })

    await marcarTodasNotificacoesLidas()

    expect(mocks.resolveTenantIdPortalComunidadeFn).toHaveBeenCalledWith(
      SESSION.user.id,
      undefined,
    )
    expect(mocks.getTenantFromHostFn).not.toHaveBeenCalled()
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

  it('marcarTodasNotificacoesLidas lança sem tenant do portal', async () => {
    mocks.resolveTenantIdPortalComunidadeFn.mockResolvedValue(null)
    await expect(marcarTodasNotificacoesLidas()).rejects.toThrow('Tenant não encontrado')
    expect(mocks.notificacaoUpdateMany).not.toHaveBeenCalled()
  })

  it('marcarTodasNotificacoesAdminLidas filtra por TIPOS_NOTIFICACAO_ADMIN via host', async () => {
    mocks.notificacaoUpdateMany.mockResolvedValue({ count: 2 })

    await marcarTodasNotificacoesAdminLidas()

    expect(mocks.getTenantFromHostFn).toHaveBeenCalled()
    expect(mocks.resolveTenantIdPortalComunidadeFn).not.toHaveBeenCalled()
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
