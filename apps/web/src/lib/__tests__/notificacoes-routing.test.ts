import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  userFindMany: vi.fn(),
  userRoleFindMany: vi.fn(),
  userPermissionFindMany: vi.fn(),
  userDepartamentoFindMany: vi.fn(),
  departamentoGestorFindMany: vi.fn(),
  notificacaoCreateMany: vi.fn(),
  notificacaoCreate: vi.fn(),
  saasMembroFindMany: vi.fn(),
  emitPing: vi.fn(),
}))

vi.mock('@/lib/env', () => ({
  superAdminEmails: ['ops@torcida.app'],
}))

vi.mock('@/lib/notificacoes-bus', () => ({
  emitNotificacaoPing: mocks.emitPing,
}))

vi.mock('@torcida/db', () => ({
  db: {
    user: { findMany: mocks.userFindMany },
    userRole: { findMany: mocks.userRoleFindMany },
    userPermission: { findMany: mocks.userPermissionFindMany },
    userDepartamento: { findMany: mocks.userDepartamentoFindMany },
    departamentoGestor: { findMany: mocks.departamentoGestorFindMany },
    notificacao: {
      createMany: mocks.notificacaoCreateMany,
      create: mocks.notificacaoCreate,
    },
    saasMembro: { findMany: mocks.saasMembroFindMany },
  },
}))

import {
  agregarBadgesPorMenu,
  listarDestinatariosPorPermissoes,
  menuIdParaTipo,
  notificarAdminsPorPermissao,
  notificarDenunciaPost,
  notificarNovoMembroPendente,
  POLITICA_POR_TIPO,
  TIPOS_NOTIFICACAO_ADMIN,
} from '@/lib/notificacoes-routing'
import type { TipoNotificacao } from '@torcida/db'
import { PERMISSIONS } from '@torcida/types'

function setupVazio() {
  mocks.userRoleFindMany.mockResolvedValue([])
  mocks.userPermissionFindMany.mockResolvedValue([])
  mocks.userDepartamentoFindMany.mockResolvedValue([])
  mocks.departamentoGestorFindMany.mockResolvedValue([])
  mocks.userFindMany.mockResolvedValue([{ id: 'super-1' }])
  mocks.notificacaoCreateMany.mockResolvedValue({ count: 1 })
}

describe('TIPOS_NOTIFICACAO_ADMIN', () => {
  it('inclui MEMBRO_SOLICITADO e DENUNCIA_NOVA', () => {
    expect(TIPOS_NOTIFICACAO_ADMIN).toContain('MEMBRO_SOLICITADO')
    expect(TIPOS_NOTIFICACAO_ADMIN).toContain('DENUNCIA_NOVA')
  })
})

describe('menuIdParaTipo / agregarBadgesPorMenu', () => {
  it('mapeia tipos operacionais para ids do ADMIN_MENU', () => {
    expect(menuIdParaTipo('MEMBRO_SOLICITADO')).toBe('membros')
    expect(menuIdParaTipo('DENUNCIA_NOVA')).toBe('comunidade-moderacao')
    expect(menuIdParaTipo('ALIANCA_PROPOSTA')).toBe('aliancas')
    expect(menuIdParaTipo('COMUNICADO_URGENTE')).toBeNull()
    expect(menuIdParaTipo('MEMBRO_APROVADO')).toBeNull()
  })

  it('mantém POLITICA_POR_TIPO.menuId alinhado ao mapa de badges', () => {
    for (const [tipo, politica] of Object.entries(POLITICA_POR_TIPO) as Array<
      [TipoNotificacao, { menuId?: string }]
    >) {
      expect(menuIdParaTipo(tipo)).toBe(politica.menuId ?? null)
    }
  })

  it('agrega contagens por menu e ignora tipos sem menuId', () => {
    const badges = agregarBadgesPorMenu([
      { tipo: 'MEMBRO_SOLICITADO', _count: { tipo: 2 } },
      { tipo: 'ALIANCA_PROPOSTA', _count: { tipo: 1 } },
      { tipo: 'ALIANCA_ACEITA', _count: { tipo: 3 } },
      { tipo: 'COMUNICADO_URGENTE', _count: { tipo: 5 } },
    ])
    expect(badges).toEqual({
      membros: 2,
      aliancas: 4,
    })
  })
})

describe('listarDestinatariosPorPermissoes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupVazio()
  })

  it('une destinatários de múltiplas permissões (OR) com um único snapshot RBAC', async () => {
    mocks.userRoleFindMany.mockResolvedValue([
      {
        userId: 'aprovador-1',
        role: {
          permissions: [],
          permissionsExtras: [PERMISSIONS.MEMBERS_APPROVE],
          departamentoId: null,
          papelNoDepartamento: null,
          departamento: null,
        },
      },
      {
        userId: 'viewer-1',
        role: {
          permissions: [],
          permissionsExtras: [PERMISSIONS.MEMBERS_VIEW],
          departamentoId: null,
          papelNoDepartamento: null,
          departamento: null,
        },
      },
    ])

    const ids = await listarDestinatariosPorPermissoes('tenant-x', [
      PERMISSIONS.MEMBERS_APPROVE,
      PERMISSIONS.MEMBERS_VIEW,
    ])
    expect(ids.sort()).toEqual(['aprovador-1', 'super-1', 'viewer-1'].sort())
    expect(mocks.userRoleFindMany).toHaveBeenCalledTimes(1)
    expect(mocks.userPermissionFindMany).toHaveBeenCalledTimes(1)
  })
})

describe('notificarAdminsPorPermissao', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupVazio()
  })

  it('notifica moderadores de comunidade via helper central', async () => {
    mocks.userRoleFindMany.mockResolvedValue([
      {
        userId: 'mod-1',
        role: {
          permissions: [],
          permissionsExtras: [PERMISSIONS.COMMUNITY_MODERATE],
          departamentoId: null,
          papelNoDepartamento: null,
          departamento: null,
        },
      },
    ])

    const count = await notificarDenunciaPost({
      tenantId: 'tenant-x',
      motivo: 'Conteúdo ofensivo no post',
      denuncianteUserId: 'user-denunciante',
    })

    expect(count).toBe(1)
    expect(mocks.notificacaoCreateMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          userId: 'mod-1',
          tipo: 'DENUNCIA_NOVA',
          link: '/admin/comunidade/moderacao',
        }),
      ]),
    })
    expect(mocks.emitPing).toHaveBeenCalled()
  })
})

describe('notificarNovoMembroPendente', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupVazio()
    mocks.notificacaoCreateMany.mockResolvedValue({ count: 2 })
  mocks.notificacaoCreate.mockResolvedValue({
    id: 'n-1',
    tenantId: 'tenant-x',
    userId: 'socio-novo',
    tipo: 'MEMBRO_SOLICITADO',
  })
  })

  it('avisa diretoria e solicitante', async () => {
    mocks.userRoleFindMany.mockResolvedValue([
      {
        userId: 'diretor-1',
        role: {
          permissions: [],
          permissionsExtras: [PERMISSIONS.MEMBERS_APPROVE],
          departamentoId: null,
          papelNoDepartamento: null,
          departamento: null,
        },
      },
    ])

    await notificarNovoMembroPendente({
      tenantId: 'tenant-x',
      tenantNome: 'Gaviões',
      solicitanteUserId: 'socio-novo',
      solicitanteNome: 'João',
      tipoVinculo: 'SOCIO',
    })

    expect(mocks.notificacaoCreateMany).toHaveBeenCalled()
    expect(mocks.notificacaoCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'socio-novo', tipo: 'MEMBRO_SOLICITADO' }),
      }),
    )
    const calls = mocks.notificacaoCreateMany.mock.calls as Array<
      [{ data: Array<{ userId: string; tipo: string }> }]
    >
    const adminUserIds = calls.flatMap((c) => c[0].data.map((d) => d.userId))
    expect(adminUserIds).toContain('diretor-1')
    expect(adminUserIds).toContain('super-1')
  })
})

describe('notificarAdminsPorPermissao', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupVazio()
  })

  it('exclui excetoUserId dos destinatários', async () => {
    mocks.userRoleFindMany.mockResolvedValue([
      {
        userId: 'mod-1',
        role: {
          permissions: [],
          permissionsExtras: [PERMISSIONS.COMMUNITY_MODERATE],
          departamentoId: null,
          papelNoDepartamento: null,
          departamento: null,
        },
      },
    ])

    await notificarAdminsPorPermissao(PERMISSIONS.COMMUNITY_MODERATE, {
      tenantId: 'tenant-x',
      tipo: 'DENUNCIA_NOVA',
      titulo: 'Teste',
      excetoUserId: 'mod-1',
    })

    const call = mocks.notificacaoCreateMany.mock.calls[0]?.[0] as
      | { data: Array<{ userId: string }> }
      | undefined
    expect(call?.data.every((d) => d.userId !== 'mod-1')).toBe(true)
  })
})
