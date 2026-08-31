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
  agregarBadgesDeInbox,
  agregarBadgesPorMenu,
  listarDestinatariosPorPermissoes,
  menuIdParaTipo,
  notificarAdminsPorPermissao,
  notificarDenunciaMensagem,
  notificarDenunciaPost,
  notificarNovoMembroPendente,
  POLITICA_POR_TIPO,
  TIPOS_NOTIFICACAO_ADMIN,
  TIPOS_NOTIFICACAO_SOCIAL,
} from '@/lib/notificacoes-routing'
import { ROTA_POR_TIPO } from '@/lib/notificacoes-menu-badges'
import type { TipoNotificacao } from '@torcida/db'
import { PERMISSIONS, resolverMenuIdDeRota } from '@torcida/types'

function setupVazio() {
  mocks.userRoleFindMany.mockResolvedValue([])
  mocks.userPermissionFindMany.mockResolvedValue([])
  mocks.userDepartamentoFindMany.mockResolvedValue([])
  mocks.departamentoGestorFindMany.mockResolvedValue([])
  mocks.userFindMany.mockResolvedValue([{ id: 'super-1' }])
  mocks.notificacaoCreateMany.mockResolvedValue({ count: 1 })
}

describe('TIPOS_NOTIFICACAO_ADMIN', () => {
  it('inclui MEMBRO_SOLICITADO, DENUNCIA_NOVA e SOLICITACAO_UNIDADE_CRIADA', () => {
    expect(TIPOS_NOTIFICACAO_ADMIN).toContain('MEMBRO_SOLICITADO')
    expect(TIPOS_NOTIFICACAO_ADMIN).toContain('DENUNCIA_NOVA')
    expect(TIPOS_NOTIFICACAO_ADMIN).toContain('SOLICITACAO_UNIDADE_CRIADA')
  })
})

describe('tipos novos de ciclo de vida', () => {
  it('evento cancelado/alterado e decisão de unidade entram no inbox social', () => {
    expect(TIPOS_NOTIFICACAO_SOCIAL).toContain('EVENTO_CANCELADO')
    expect(TIPOS_NOTIFICACAO_SOCIAL).toContain('EVENTO_ALTERADO')
    expect(TIPOS_NOTIFICACAO_SOCIAL).toContain('SOLICITACAO_UNIDADE_APROVADA')
    expect(TIPOS_NOTIFICACAO_SOCIAL).toContain('SOLICITACAO_UNIDADE_RECUSADA')
  })

  it('comunicado NORMAL, caixa avulso, design e check-in entram no escopo certo', () => {
    expect(TIPOS_NOTIFICACAO_SOCIAL).toContain('COMUNICADO_NOVO')
    expect(TIPOS_NOTIFICACAO_ADMIN).not.toContain('COMUNICADO_NOVO')
    expect(TIPOS_NOTIFICACAO_SOCIAL).toContain('FINANCEIRO_LANCAMENTO')
    expect(TIPOS_NOTIFICACAO_ADMIN).toContain('FINANCEIRO_LANCAMENTO')
    expect(TIPOS_NOTIFICACAO_ADMIN).toContain('DESIGN_ATUALIZADO')
    expect(TIPOS_NOTIFICACAO_SOCIAL).not.toContain('DESIGN_ATUALIZADO')
    expect(TIPOS_NOTIFICACAO_SOCIAL).toContain('EVENTO_CHECKIN')
    expect(TIPOS_NOTIFICACAO_ADMIN).not.toContain('EVENTO_CHECKIN')
  })
})

describe('menuIdParaTipo / agregarBadgesPorMenu', () => {
  it('mapeia tipos operacionais para ids do ADMIN_MENU', () => {
    expect(menuIdParaTipo('MEMBRO_SOLICITADO')).toBe('socios')
    expect(menuIdParaTipo('ALIANCA_PROPOSTA')).toBe('aliancas')
    expect(menuIdParaTipo('COMUNICADO_URGENTE')).toBe('comunidade')
    expect(menuIdParaTipo('MEMBRO_APROVADO')).toBeNull()
    expect(menuIdParaTipo('COBRANCA_PENDENTE')).toBeNull()
    expect(menuIdParaTipo('EVENTO_LEMBRETE')).toBeNull()
    expect(menuIdParaTipo('COMUNICADO_NOVO')).toBeNull()
    expect(menuIdParaTipo('EVENTO_CHECKIN')).toBeNull()
    expect(menuIdParaTipo('FINANCEIRO_LANCAMENTO')).toBe('financeiro')
    expect(menuIdParaTipo('DESIGN_ATUALIZADO')).toBe('plataforma')
  })

  // Regressão da wave 1: promover uma rota a tab de módulo tirava a entrada do
  // ADMIN_MENU e o badge sumia em silêncio. Resolvendo por rota, ele sobe.
  it('sobe o badge para a entrada do módulo quando a rota virou tab', () => {
    expect(menuIdParaTipo('DENUNCIA_NOVA')).toBe('comunidade')
    expect(menuIdParaTipo('COBRANCA_VENCIDA')).toBe('financeiro')
    expect(menuIdParaTipo('PEDIDO_RECEBIDO')).toBe('loja')
    expect(menuIdParaTipo('BRECHO_DENUNCIA')).toBe('loja')
    expect(menuIdParaTipo('BAR_ESTOQUE_BAIXO')).toBe('bar')
    expect(menuIdParaTipo('BAR_ESTORNO_ANOMALO')).toBe('bar')
    // Afiliações virou etapa de Estrutura, montada em route group.
    expect(menuIdParaTipo('SOLICITACAO_UNIDADE_CRIADA')).toBe('estrutura')
    // PDV segue fora do shell de tabs e tem entrada própria no menu: a entrada
    // mais específica vence a tab `/admin/bar` do módulo.
    expect(menuIdParaTipo('BAR_TURNO_DIVERGENCIA')).toBe('bar-pdv')
  })

  it('mantém POLITICA_POR_TIPO.rota alinhada ao mapa de badges', () => {
    for (const [tipo, politica] of Object.entries(POLITICA_POR_TIPO) as Array<
      [TipoNotificacao, { rota?: string }]
    >) {
      expect(ROTA_POR_TIPO[tipo] ?? null).toBe(politica.rota ?? null)
    }
  })

  it('toda rota de badge cai em alguma entrada existente do menu', () => {
    for (const [tipo, rota] of Object.entries(ROTA_POR_TIPO) as Array<[TipoNotificacao, string]>) {
      expect(resolverMenuIdDeRota(rota), `rota órfã em ${tipo}: ${rota}`).not.toBeNull()
    }
  })

  it('agrega contagens por menu e ignora tipos sem rota', () => {
    const badges = agregarBadgesPorMenu([
      { tipo: 'MEMBRO_SOLICITADO', _count: { tipo: 2 } },
      { tipo: 'ALIANCA_PROPOSTA', _count: { tipo: 1 } },
      { tipo: 'ALIANCA_ACEITA', _count: { tipo: 3 } },
      { tipo: 'COMUNICADO_URGENTE', _count: { tipo: 5 } },
    ])
    expect(badges).toEqual({
      socios: 2,
      aliancas: 4,
      comunidade: 5,
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

  it('notifica o denunciante quando ele é o único elegível (solo admin)', async () => {
    mocks.userFindMany.mockResolvedValue([{ id: 'super-1' }])
    mocks.userRoleFindMany.mockResolvedValue([])

    const count = await notificarDenunciaPost({
      tenantId: 'tenant-x',
      motivo: 'TESTE DENÚNCIA',
      denuncianteUserId: 'super-1',
    })

    expect(count).toBe(1)
    expect(mocks.notificacaoCreateMany).toHaveBeenCalledTimes(1)
    expect(mocks.notificacaoCreateMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          userId: 'super-1',
          tipo: 'DENUNCIA_NOVA',
          titulo: 'Nova denúncia pendente',
        }),
      ]),
    })
  })

  it('inclui o denunciante elegível mesmo com outros moderadores (sino instantâneo)', async () => {
    mocks.notificacaoCreateMany.mockResolvedValue({ count: 2 })
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
        userId: 'super-1',
        role: {
          permissions: [],
          permissionsExtras: [PERMISSIONS.MESSAGES_MODERATE],
          departamentoId: null,
          papelNoDepartamento: null,
          departamento: null,
        },
      },
    ])
    mocks.userFindMany.mockResolvedValue([{ id: 'super-1' }])

    const count = await notificarDenunciaMensagem({
      tenantId: 'tenant-x',
      motivo: 'teste denuncia',
      denuncianteUserId: 'super-1',
    })

    expect(count).toBe(2)
    expect(mocks.notificacaoCreateMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ userId: 'mod-1', titulo: 'Nova denúncia de mensagem' }),
        expect.objectContaining({ userId: 'super-1', titulo: 'Nova denúncia de mensagem' }),
      ]),
    })
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

describe('agregarBadgesDeInbox', () => {
  it('usa o link para distinguir sócio de torcedor', () => {
    const badges = agregarBadgesDeInbox([
      { tipo: 'MEMBRO_SOLICITADO', link: '/admin/torcedores?status=PENDENTE' },
      { tipo: 'MEMBRO_SOLICITADO', link: '/admin/socios?status=solicitacoes' },
      { tipo: 'MEMBRO_SOLICITADO', link: null },
    ])
    expect(badges.menuBadges).toEqual({ torcedores: 1, socios: 2 })
  })

  it('sobe estorno para a tab Vendas e o menu Bar, sem pingar o PDV', () => {
    const badges = agregarBadgesDeInbox([
      { tipo: 'BAR_ESTORNO_ANOMALO', link: '/admin/bar/estornos' },
    ])
    expect(badges.menuBadges).toEqual({ bar: 1 })
    expect(badges.tabBadges).toEqual({ '/admin/bar/vendas': 1 })
  })

  it('deixa o PDV no próprio item do menu, sem badge na tab raiz do Bar', () => {
    const badges = agregarBadgesDeInbox([
      { tipo: 'BAR_TURNO_DIVERGENCIA', link: '/admin/bar/pdv' },
    ])
    expect(badges.menuBadges).toEqual({ 'bar-pdv': 1 })
    expect(badges.tabBadges).toEqual({})
  })

  it('conta departamentos no portal por slug e seção (?tab= ou #hash)', () => {
    const badges = agregarBadgesDeInbox([
      { tipo: 'DEPARTAMENTO_ADICIONADO', link: '/portal/departamentos/financeiro?tab=areas' },
      { tipo: 'DEPARTAMENTO_ADICIONADO', link: '/portal/departamentos/financeiro#projetos' },
      { tipo: 'ACESSO_ATUALIZADO', link: '/portal/departamentos/bateria?tab=equipe' },
      { tipo: 'DEPARTAMENTO_REMOVIDO', link: '/portal/departamentos' },
    ])
    expect(badges.portalNavBadges.departamentos).toBe(4)
    expect(badges.portalNavBadges.porSlug).toEqual({ financeiro: 2, bateria: 1 })
    expect(badges.portalNavBadges.porSecao).toEqual({
      financeiro: { areas: 1, projetos: 1 },
      bateria: { equipe: 1 },
    })
    expect(badges.menuBadges).toEqual({})
  })

  it('não badgeia menu admin em cobrança/lembrete da pessoa', () => {
    const badges = agregarBadgesDeInbox([
      { tipo: 'COBRANCA_PENDENTE', link: '/portal/cobrancas/c1' },
      { tipo: 'COBRANCA_VENCIDA', link: '/portal/cobrancas/c1' },
      { tipo: 'EVENTO_LEMBRETE', link: '/portal/eventos/e1' },
    ])
    expect(badges.menuBadges).toEqual({})
    expect(badges.portalNavBadges.eventos).toBe(1)
  })

  it('badgeia Financeiro só no aviso ao gestor, não no do devedor', () => {
    const badges = agregarBadgesDeInbox([
      { tipo: 'COBRANCA_VENCIDA', link: '/admin/financeiro/cobrancas?status=VENCIDA&cobranca=c1' },
    ])
    expect(badges.menuBadges).toEqual({ financeiro: 1 })
    expect(badges.tabBadges['/admin/financeiro/cobrancas?status=VENCIDA']).toBe(1)
  })

  it('agrega tab de Sócios/Torcedores pela query status', () => {
    const badges = agregarBadgesDeInbox([
      { tipo: 'MEMBRO_SOLICITADO', link: '/admin/socios?status=solicitacoes&page=2' },
      { tipo: 'MEMBRO_SOLICITADO', link: '/admin/torcedores?status=PENDENTE' },
    ])
    expect(badges.menuBadges).toEqual({ socios: 1, torcedores: 1 })
    expect(badges.tabBadges['/admin/socios?status=solicitacoes']).toBe(1)
    expect(badges.tabBadges['/admin/torcedores?status=PENDENTE']).toBe(1)
  })

  it('conta Agenda, Loja e pedidos de área no portal', () => {
    const badges = agregarBadgesDeInbox([
      { tipo: 'EVENTO_ALTERADO', link: '/portal/eventos/abc' },
      { tipo: 'PEDIDO_CONFIRMADO', link: '/portal/loja/pedidos' },
      { tipo: 'SOCIO_CARTEIRINHA_EMITIDA', link: '/portal/carteirinha' },
      { tipo: 'DEPARTAMENTO_ADICIONADO', link: '/portal/departamentos/financeiro?tab=pedidos' },
    ])
    expect(badges.portalNavBadges.eventos).toBe(1)
    expect(badges.portalNavBadges.loja).toBe(1)
    expect(badges.portalNavBadges.carteirinha).toBe(1)
    expect(badges.portalNavBadges.porSecao).toEqual({ financeiro: { pedidos: 1 } })
  })

  it('badgeia Sedes no portal, ignorando recusa e canal restrito', () => {
    const badges = agregarBadgesDeInbox([
      { tipo: 'SOLICITACAO_UNIDADE_APROVADA', link: '/portal/sedes' },
      { tipo: 'SOLICITACAO_UNIDADE_RECUSADA', link: '/portal/comunidade' },
      { tipo: 'CANAL_RESTRITO_ATIVADO', link: '/portal/sedes' },
    ])
    expect(badges.portalNavBadges.sedes).toBe(1)
  })

  it('acende o hub certo do evento, não Agenda genérica', () => {
    const badges = agregarBadgesDeInbox([
      { tipo: 'EVENTO_RSVP', link: '/admin/caravanas/e1' },
      { tipo: 'EVENTO_DIA_GESTOR', link: '/admin/bateria/e2' },
    ])
    expect(badges.menuBadges).toEqual({ caravanas: 1, bateria: 1 })
    expect(badges.tabBadges['/admin/bateria?tab=ensaios']).toBe(1)
  })

  it('custódia de bandeira acende portal e overlay de Bandeiras', () => {
    const badges = agregarBadgesDeInbox([
      { tipo: 'PATRIMONIO_RESPONSAVEL_DEFINIDO', link: '/portal/departamentos/bandeiras?item=i1' },
    ])
    expect(badges.portalNavBadges.departamentos).toBe(1)
    expect(badges.portalNavBadges.porSlug).toEqual({ bandeiras: 1 })
    expect(badges.menuBadges).toEqual({ bandeiras: 1 })
    expect(badges.tabBadges['/admin/bandeiras?tab=pendencias']).toBe(1)
  })

  it('proposta de aliança acende a tab Recebidas', () => {
    const badges = agregarBadgesDeInbox([
      { tipo: 'ALIANCA_PROPOSTA', link: '/admin/aliancas?tab=recebidas' },
    ])
    expect(badges.menuBadges).toEqual({ aliancas: 1 })
    expect(badges.tabBadges['/admin/aliancas?tab=recebidas']).toBe(1)
  })

  it('comunicado NORMAL acende Comunidade no portal, não o admin', () => {
    const badges = agregarBadgesDeInbox([
      { tipo: 'COMUNICADO_NOVO', link: '/portal/comunidade' },
    ])
    expect(badges.portalNavBadges.comunidade).toBe(1)
    expect(badges.menuBadges).toEqual({})
  })

  it('comunicado urgente acende Comunidade e a tab Comunicados', () => {
    const badges = agregarBadgesDeInbox([
      { tipo: 'COMUNICADO_URGENTE', link: '/portal/comunidade' },
    ])
    expect(badges.portalNavBadges.comunidade).toBe(1)
    expect(badges.menuBadges).toEqual({ comunidade: 1 })
    expect(badges.tabBadges['/admin/comunidade/comunicados']).toBe(1)
  })

  it('lançamento avulso acende Financeiro; check-in acende Agenda', () => {
    const financeiro = agregarBadgesDeInbox([
      { tipo: 'FINANCEIRO_LANCAMENTO', link: '/admin/financeiro/lancamentos?lancamento=l1' },
    ])
    expect(financeiro.menuBadges).toEqual({ financeiro: 1 })
    expect(financeiro.tabBadges['/admin/financeiro/lancamentos']).toBe(1)

    const checkin = agregarBadgesDeInbox([
      { tipo: 'EVENTO_CHECKIN', link: '/portal/eventos/e1' },
    ])
    expect(checkin.portalNavBadges.eventos).toBe(1)
    expect(checkin.menuBadges).toEqual({})
  })

  it('design atualizado acende a tab Identidade da Plataforma', () => {
    const badges = agregarBadgesDeInbox([
      { tipo: 'DESIGN_ATUALIZADO', link: '/admin/design' },
    ])
    expect(badges.menuBadges).toEqual({ plataforma: 1 })
    expect(badges.tabBadges['/admin/design']).toBe(1)
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
