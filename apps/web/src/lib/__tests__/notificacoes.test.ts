import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  userFindMany: vi.fn(),
  userRoleFindMany: vi.fn(),
  userPermissionFindMany: vi.fn(),
  userDepartamentoFindMany: vi.fn(),
  departamentoGestorFindMany: vi.fn(),
  notificacaoCreateMany: vi.fn(),
  saasMembroFindMany: vi.fn(),
}))

vi.mock('@/lib/env', () => ({
  superAdminEmails: ['ops@torcida.app'],
}))

vi.mock('@/lib/notificacoes-bus', () => ({
  emitNotificacaoPing: vi.fn(),
}))

vi.mock('@torcida/db', () => ({
  db: {
    user: { findMany: mocks.userFindMany },
    userRole: { findMany: mocks.userRoleFindMany },
    userPermission: { findMany: mocks.userPermissionFindMany },
    userDepartamento: { findMany: mocks.userDepartamentoFindMany },
    departamentoGestor: { findMany: mocks.departamentoGestorFindMany },
    notificacao: { createMany: mocks.notificacaoCreateMany },
    saasMembro: { findMany: mocks.saasMembroFindMany },
  },
}))

import {
  listarDestinatariosAdmin,
  listarUserIdsComQualquerPermissao,
  listarUserIdsSuperAdmin,
  notificarUsuariosComPermissao,
} from '@/lib/notificacoes'
import { PERMISSIONS } from '@torcida/types'

describe('listarUserIdsSuperAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resolve userIds pelos e-mails de SUPER_ADMIN_EMAILS', async () => {
    mocks.userFindMany.mockResolvedValue([{ id: 'super-1' }])
    await expect(listarUserIdsSuperAdmin()).resolves.toEqual(['super-1'])
    expect(mocks.userFindMany).toHaveBeenCalledWith({
      where: { email: { in: ['ops@torcida.app'] } },
      select: { id: true },
    })
  })
})

describe('listarUserIdsComQualquerPermissao', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.userRoleFindMany.mockResolvedValue([])
    mocks.userPermissionFindMany.mockResolvedValue([])
    mocks.userDepartamentoFindMany.mockResolvedValue([])
    mocks.departamentoGestorFindMany.mockResolvedValue([])
  })

  it('resolve múltiplas permissões com uma única carga do tenant', async () => {
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
      {
        userId: 'loja-1',
        role: {
          permissions: [],
          permissionsExtras: [PERMISSIONS.STORE_MANAGE],
          departamentoId: null,
          papelNoDepartamento: null,
          departamento: null,
        },
      },
    ])

    const ids = await listarUserIdsComQualquerPermissao('tenant-x', [
      PERMISSIONS.COMMUNITY_MODERATE,
      PERMISSIONS.STORE_MANAGE,
    ])
    expect(ids.sort()).toEqual(['loja-1', 'mod-1'].sort())
    expect(mocks.userRoleFindMany).toHaveBeenCalledTimes(1)
  })
})

describe('listarDestinatariosAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.userRoleFindMany.mockResolvedValue([])
    mocks.userPermissionFindMany.mockResolvedValue([])
    mocks.userDepartamentoFindMany.mockResolvedValue([])
    mocks.departamentoGestorFindMany.mockResolvedValue([])
    mocks.userFindMany.mockResolvedValue([{ id: 'super-1' }])
  })

  it('inclui super-admins mesmo sem UserRole no tenant (modo operador)', async () => {
    const ids = await listarDestinatariosAdmin('tenant-remista', PERMISSIONS.ALLIANCES_MANAGE)
    expect(ids).toEqual(['super-1'])
  })

  it('une titulares da permissão com super-admins e aplica excetoUserId', async () => {
    mocks.userRoleFindMany.mockResolvedValue([
      {
        userId: 'presidente-1',
        role: {
          permissions: [],
          permissionsExtras: [PERMISSIONS.ALLIANCES_MANAGE],
          departamentoId: null,
          papelNoDepartamento: null,
          departamento: null,
        },
      },
    ])
    mocks.userFindMany.mockResolvedValue([{ id: 'super-1' }, { id: 'presidente-1' }])

    const ids = await listarDestinatariosAdmin(
      'tenant-x',
      PERMISSIONS.ALLIANCES_MANAGE,
      'super-1',
    )
    expect(ids.sort()).toEqual(['presidente-1'])
  })
})

describe('notificarUsuariosComPermissao', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.userRoleFindMany.mockResolvedValue([])
    mocks.userPermissionFindMany.mockResolvedValue([])
    mocks.userDepartamentoFindMany.mockResolvedValue([])
    mocks.departamentoGestorFindMany.mockResolvedValue([])
    mocks.userFindMany.mockResolvedValue([{ id: 'super-1' }])
    mocks.notificacaoCreateMany.mockResolvedValue({ count: 1 })
  })

  it('grava notificação para super-admin em tenant sem roles (ex.: proposta de aliança)', async () => {
    const count = await notificarUsuariosComPermissao(PERMISSIONS.ALLIANCES_MANAGE, {
      tenantId: 'tenant-remista',
      tipo: 'ALIANCA_PROPOSTA',
      titulo: 'Proposta de aliança de Gaviões da Fiel',
      corpo: 'Gaviões da Fiel propôs aliança com Remista.',
      link: '/admin/aliancas',
    })

    expect(count).toBe(1)
    expect(mocks.notificacaoCreateMany).toHaveBeenCalledWith({
      data: [
        {
          userId: 'super-1',
          tenantId: 'tenant-remista',
          tipo: 'ALIANCA_PROPOSTA',
          titulo: 'Proposta de aliança de Gaviões da Fiel',
          corpo: 'Gaviões da Fiel propôs aliança com Remista.',
          link: '/admin/aliancas',
          atorId: null,
        },
      ],
    })
  })
})
