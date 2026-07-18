import { describe, expect, it } from 'vitest'
import {
  ADMIN_MENU,
  calculateEffectivePermissions,
  canManageDepartamento,
  capabilityPorSlug,
  DEPARTAMENTO_MODULO_ROTA,
  DEPARTAMENTO_MODULOS,
  filterMenuByPermissions,
  groupAdminMenuBySecao,
  hasAdminAreaAccess,
  hasPermission,
  hrefHomeDepartamento,
  hrefModuloPortal,
  hrefOperacaoAdmin,
  MAX_VICE_PRESIDENTES,
  PERMISSIONS,
  podeTerVice,
  permissionsOfRole,
  rotuloCargoMaximo,
  rotuloCargoSistema,
  SYSTEM_ROLE_PERMISSIONS,
  SYSTEM_ROLES,
  WILDCARD_PERMISSION,
} from '@torcida/types'
import { DEPARTAMENTOS_CANONICOS } from '../../../../../packages/db/src/departamentos-canonicos.js'

describe('hasPermission', () => {
  it('concede acesso quando a permissão está na lista efetiva (role autorizada)', () => {
    const effective = [PERMISSIONS.MEMBERS_VIEW]

    expect(hasPermission(effective, PERMISSIONS.MEMBERS_VIEW)).toBe(true)
  })

  it('nega acesso quando a permissão não está na lista efetiva (role não autorizada)', () => {
    const effective = [PERMISSIONS.MEMBERS_VIEW]

    expect(hasPermission(effective, PERMISSIONS.ROLES_MANAGE)).toBe(false)
  })

  it('concede qualquer permissão quando a lista tem o coringa do owner', () => {
    const effective = [WILDCARD_PERMISSION]

    expect(hasPermission(effective, PERMISSIONS.SETTINGS_MANAGE)).toBe(true)
  })
})

describe('calculateEffectivePermissions', () => {
  it('inclui permissões do(s) cargo(s) do usuário (role autorizada acessa)', () => {
    const effective = calculateEffectivePermissions([PERMISSIONS.MEMBERS_VIEW], [])

    expect(hasPermission(effective, PERMISSIONS.MEMBERS_VIEW)).toBe(true)
  })

  it('override pontual concede uma permissão que o cargo não dá', () => {
    const effective = calculateEffectivePermissions(
      [PERMISSIONS.MEMBERS_VIEW],
      [{ permission: PERMISSIONS.EVENTS_MANAGE, granted: true }],
    )

    expect(hasPermission(effective, PERMISSIONS.EVENTS_MANAGE)).toBe(true)
  })

  it('override pontual revoga uma permissão que o cargo daria (role não autorizada recebe negação)', () => {
    const effective = calculateEffectivePermissions(
      [PERMISSIONS.MEMBERS_VIEW, PERMISSIONS.ROLES_MANAGE],
      [{ permission: PERMISSIONS.ROLES_MANAGE, granted: false }],
    )

    expect(hasPermission(effective, PERMISSIONS.ROLES_MANAGE)).toBe(false)
    expect(hasPermission(effective, PERMISSIONS.MEMBERS_VIEW)).toBe(true)
  })
})

describe('permissionsOfRole (perfil ↔ departamento)', () => {
  it('perfil de área herda pacote de membro + extras', () => {
    const depto = {
      permissions: [PERMISSIONS.FINANCE_VIEW],
      permissionsGestor: [PERMISSIONS.FINANCE_MANAGE],
    }
    const role = {
      departamentoId: 'd1',
      papelNoDepartamento: 'MEMBRO',
      permissions: [],
      permissionsExtras: [PERMISSIONS.REPORTS_VIEW],
    }
    const perms = permissionsOfRole(role, depto)
    expect(perms).toContain(PERMISSIONS.FINANCE_VIEW)
    expect(perms).toContain(PERMISSIONS.REPORTS_VIEW)
    expect(perms).not.toContain(PERMISSIONS.FINANCE_MANAGE)
  })

  it('gestor soma permissionsGestor', () => {
    const depto = {
      permissions: [PERMISSIONS.FINANCE_VIEW],
      permissionsGestor: [PERMISSIONS.FINANCE_MANAGE],
    }
    const role = {
      departamentoId: 'd1',
      papelNoDepartamento: 'GESTOR',
      permissions: [],
      permissionsExtras: [],
    }
    const perms = permissionsOfRole(role, depto)
    expect(perms).toEqual(
      expect.arrayContaining([PERMISSIONS.FINANCE_VIEW, PERMISSIONS.FINANCE_MANAGE]),
    )
  })

  it('perfil transversal usa permissions legado', () => {
    const role = {
      departamentoId: null,
      permissions: [PERMISSIONS.COMMUNITY_POST],
      permissionsExtras: [PERMISSIONS.MESSAGES_SEND],
    }
    const perms = permissionsOfRole(role, null)
    expect(perms).toContain(PERMISSIONS.COMMUNITY_POST)
    expect(perms).toContain(PERMISSIONS.MESSAGES_SEND)
  })
})

describe('permissões de departamento (base = perfis ∪ departamentos)', () => {
  it('compõe a união de permissões de perfil e departamento, sem duplicatas', () => {
    const permsDePerfil = [PERMISSIONS.MEMBERS_VIEW, PERMISSIONS.EVENTS_MANAGE]
    const permsDeDepartamento = [PERMISSIONS.EVENTS_MANAGE, PERMISSIONS.ROLES_MANAGE]

    const effective = calculateEffectivePermissions(
      [...permsDePerfil, ...permsDeDepartamento],
      [],
    )

    expect(effective).toContain(PERMISSIONS.MEMBERS_VIEW)
    expect(effective).toContain(PERMISSIONS.EVENTS_MANAGE)
    expect(effective).toContain(PERMISSIONS.ROLES_MANAGE)
    expect(new Set(effective).size).toBe(effective.length)
  })

  it('override negativo remove permissão mesmo quando ela vem de um departamento', () => {
    const permsDePerfil = [PERMISSIONS.MEMBERS_VIEW]
    const permsDeDepartamento = [PERMISSIONS.EVENTS_MANAGE]

    const effective = calculateEffectivePermissions(
      [...permsDePerfil, ...permsDeDepartamento],
      [{ permission: PERMISSIONS.EVENTS_MANAGE, granted: false }],
    )

    expect(hasPermission(effective, PERMISSIONS.EVENTS_MANAGE)).toBe(false)
    expect(hasPermission(effective, PERMISSIONS.MEMBERS_VIEW)).toBe(true)
  })
})

describe('perfil de sistema Vice', () => {
  it('vice tem gestão global (ROLES_MANAGE) mas não SETTINGS_MANAGE', () => {
    const vicePermissions = SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.VICE]

    expect(vicePermissions).toContain(PERMISSIONS.ROLES_MANAGE)
    expect(vicePermissions).not.toContain(PERMISSIONS.SETTINGS_MANAGE)
  })

  it('vice tem visão global da torcida (console do Presidente)', () => {
    const vicePermissions = SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.VICE]

    expect(vicePermissions).toContain(PERMISSIONS.TORCIDA_GLOBAL_VIEW)
  })

  it('uma torcida admite no máximo 2 vice-presidentes', () => {
    expect(MAX_VICE_PRESIDENTES).toBe(2)
  })

  it('vice só existe no tenant da Sede principal (tipo SEDE)', () => {
    expect(podeTerVice('SEDE')).toBe(true)
    expect(podeTerVice('SUBSEDE')).toBe(false)
    expect(podeTerVice('PONTO_ENCONTRO')).toBe(false)
  })
})

describe('visão global da torcida (TORCIDA_GLOBAL_VIEW)', () => {
  it('admin comum NÃO tem visão global nem configurações', () => {
    const adminPermissions = SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.ADMIN]

    expect(adminPermissions).not.toContain(PERMISSIONS.TORCIDA_GLOBAL_VIEW)
    expect(adminPermissions).not.toContain(PERMISSIONS.SETTINGS_MANAGE)
  })

  it('owner (Presidente) tem visão global via ALL_PERMISSIONS e via coringa', () => {
    const ownerPermissions = SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.OWNER]

    expect(ownerPermissions).toContain(PERMISSIONS.TORCIDA_GLOBAL_VIEW)
    expect(hasPermission([WILDCARD_PERMISSION], PERMISSIONS.TORCIDA_GLOBAL_VIEW)).toBe(true)
  })
})

describe('rótulos de cargos de sistema por tipo de Sede', () => {
  it('cargo máximo: Presidente na Sede, Liderança em subsede/PDE', () => {
    expect(rotuloCargoMaximo('SEDE')).toBe('Presidente')
    expect(rotuloCargoMaximo('SUBSEDE')).toBe('Liderança')
    expect(rotuloCargoMaximo('PONTO_ENCONTRO')).toBe('Liderança')
  })

  it('rotuloCargoSistema mapeia owner conforme o tipo e mantém nomes não mapeados', () => {
    expect(rotuloCargoSistema('owner', 'SEDE')).toBe('Presidente')
    expect(rotuloCargoSistema('owner', 'SUBSEDE')).toBe('Liderança')
    expect(rotuloCargoSistema('vice', 'SEDE')).toBe('Vice-presidente')
    expect(rotuloCargoSistema('admin', 'SUBSEDE')).toBe('Administrador')
    expect(rotuloCargoSistema('member', 'SEDE')).toBe('Membro')
    expect(rotuloCargoSistema('tesoureiro', 'SEDE')).toBe('tesoureiro')
  })
})

describe('DEPARTAMENTO_MODULO_ROTA (hub do portal)', () => {
  it('todo módulo de departamento tem uma entrada de rota', () => {
    for (const modulo of DEPARTAMENTO_MODULOS) {
      expect(DEPARTAMENTO_MODULO_ROTA).toHaveProperty(modulo.key)
    }
  })

  it('módulo disponível tem href portal; indisponível não tem; nenhum aponta para admin', () => {
    for (const rota of Object.values(DEPARTAMENTO_MODULO_ROTA)) {
      if (rota.disponivel) {
        expect(rota.href).toBeTruthy()
        expect(rota.href?.startsWith('/portal')).toBe(true)
        expect(rota.href?.startsWith('/admin')).toBe(false)
      } else {
        expect(rota.href).toBeNull()
      }
    }
  })
})

describe('departamento capabilities', () => {
  it('home e operação: módulo portal nunca é admin; operação pode ser', () => {
    expect(hrefHomeDepartamento('financeiro')).toBe('/portal/departamentos/financeiro')
    expect(hrefModuloPortal('eventos')).toBe('/portal/eventos')
    expect(hrefModuloPortal('financeiro')).toBe('/portal/financeiro')
    expect(hrefModuloPortal('patrimonio')).toBe('/portal/patrimonio')
    expect(hrefModuloPortal('caravanas')).toBe('/portal/eventos?tipo=CARAVANA')
    expect(hrefModuloPortal('bateria')).toBe('/portal/eventos?tipo=ENSAIO')
    expect(hrefOperacaoAdmin('financeiro')).toBe('/admin/financeiro')
    expect(hrefOperacaoAdmin('patrimonio')).toBe('/admin/patrimonio')
    expect(hrefOperacaoAdmin('caravanas')).toBe('/admin/eventos?tipo=CARAVANA')
    expect(hrefOperacaoAdmin('bateria')).toBe('/admin/eventos?tipo=ENSAIO')
    expect(capabilityPorSlug('bateria')?.portalPanel).toBe('bateria')
    expect(capabilityPorSlug('patrimonio')?.portalPanel).toBe('patrimonio')
    expect(capabilityPorSlug('caravanas')?.moduloPortal).toBe('caravanas')
    expect(capabilityPorSlug('bateria')?.moduloPortal).toBe('bateria')
  })
})

describe('canManageDepartamento', () => {
  it('ROLES_MANAGE sempre pode gerir qualquer departamento', () => {
    expect(canManageDepartamento([PERMISSIONS.ROLES_MANAGE], [], 'depto-x')).toBe(true)
  })

  it('gestor listado só do próprio departamento pode gerir', () => {
    expect(canManageDepartamento([], ['depto-a'], 'depto-a')).toBe(true)
    expect(canManageDepartamento([], ['depto-a'], 'depto-b')).toBe(false)
  })
})

describe('filterMenuByPermissions com OR', () => {
  it('item com array de permissões aparece se tiver qualquer uma', () => {
    const menu = [
      { id: 'eventos', label: 'Eventos', href: '/admin/eventos', permissao: [PERMISSIONS.EVENTS_CREATE, PERMISSIONS.EVENTS_MANAGE] },
    ]
    expect(filterMenuByPermissions(menu, [PERMISSIONS.EVENTS_CREATE])).toHaveLength(1)
    expect(filterMenuByPermissions(menu, [PERMISSIONS.EVENTS_MANAGE])).toHaveLength(1)
    expect(filterMenuByPermissions(menu, [PERMISSIONS.MEMBERS_VIEW])).toHaveLength(0)
  })

  it('ADMIN_MENU: members:approve vê Membros; messages:moderate vê Moderação', () => {
    const soAprovar = filterMenuByPermissions(ADMIN_MENU, [PERMISSIONS.MEMBERS_APPROVE])
    expect(soAprovar.map((i) => i.id)).toContain('membros')
    expect(soAprovar.map((i) => i.id)).not.toContain('socios')

    const soMsgMod = filterMenuByPermissions(ADMIN_MENU, [PERMISSIONS.MESSAGES_MODERATE])
    expect(soMsgMod.map((i) => i.id)).toContain('comunidade-moderacao')
  })

  it('ADMIN_MENU: pacote Financeiro (membro) não abre admin — só Dashboard', () => {
    const financePerms = [
      PERMISSIONS.FINANCE_VIEW,
      PERMISSIONS.REPORTS_VIEW,
      PERMISSIONS.MESSAGES_SEND,
    ]
    const ids = filterMenuByPermissions(ADMIN_MENU, financePerms).map((i) => i.id)
    expect(ids).toEqual(['dashboard'])
    expect(ids).not.toContain('financeiro')
    expect(ids).not.toContain('membros')
  })

  it('ADMIN_MENU: finance:manage abre Financeiro; events:manage abre Eventos', () => {
    expect(
      filterMenuByPermissions(ADMIN_MENU, [PERMISSIONS.FINANCE_MANAGE]).map((i) => i.id),
    ).toEqual(['dashboard', 'financeiro', 'planos-associacao', 'cobrancas'])
    expect(
      filterMenuByPermissions(ADMIN_MENU, [PERMISSIONS.EVENTS_MANAGE]).map((i) => i.id),
    ).toEqual(['dashboard', 'eventos'])
    expect(
      filterMenuByPermissions(ADMIN_MENU, [PERMISSIONS.EVENTS_CREATE]).map((i) => i.id),
    ).toEqual(['dashboard'])
  })

  it('hierarquia exige roles:manage (não members:view)', () => {
    const soMembers = filterMenuByPermissions(ADMIN_MENU, [PERMISSIONS.MEMBERS_VIEW]).map(
      (i) => i.id,
    )
    expect(soMembers).toContain('membros')
    expect(soMembers).not.toContain('hierarquia')
  })

  it('groupAdminMenuBySecao omite seções vazias e agrupa por módulo', () => {
    const items = filterMenuByPermissions(ADMIN_MENU, [
      PERMISSIONS.FINANCE_MANAGE,
      PERMISSIONS.MEMBERS_VIEW,
    ]).map((i) => ({ id: i.id, label: i.label, href: i.href, secao: i.secao }))
    const groups = groupAdminMenuBySecao(items)
    expect(groups.map((g) => g.id)).toEqual(['geral', 'pessoas', 'financeiro'])
    expect(groups.find((g) => g.id === 'financeiro')?.label).toBe('Financeiro')
  })

  it('Fase 2: pacote colaborador de toda área canônica não abre área admin', () => {
    for (const area of DEPARTAMENTOS_CANONICOS) {
      const ids = filterMenuByPermissions(ADMIN_MENU, area.permissions).map((i) => i.id)
      expect(ids, area.nome).toEqual(['dashboard'])
      expect(hasAdminAreaAccess(area.permissions), area.nome).toBe(false)
    }
  })

  it('Fase 2: gestor de cada área canônica ganha ao menos um item admin além do dashboard', () => {
    for (const area of DEPARTAMENTOS_CANONICOS) {
      const efetivas = [...area.permissions, ...area.permissionsGestor]
      expect(hasAdminAreaAccess(efetivas), area.nome).toBe(true)
      const ids = filterMenuByPermissions(ADMIN_MENU, efetivas).map((i) => i.id)
      expect(ids.length, area.nome).toBeGreaterThan(1)
    }
  })
})
