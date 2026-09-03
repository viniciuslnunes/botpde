import { describe, expect, it } from 'vitest'
import {
  ADMIN_MENU,
  applyPermissionCascade,
  calculateEffectivePermissions,
  canManageDepartamento,
  capabilityPorSlug,
  DEPARTAMENTO_MODULO_ROTA,
  DEPARTAMENTO_MODULOS,
  filterMenuByPermissions,
  filterMenuByPermissionsAndGestoria,
  groupAdminMenuBySecao,
  hasAdminAreaAccess,
  hasPermission,
  hrefHomeDepartamento,
  hrefModuloPortal,
  hrefOperacaoAdmin,
  isDepartamentoLegado,
  MAX_PRESIDENTES,
  MAX_VICE_PRESIDENTES,
  PERMISSIONS,
  podeTerVice,
  podeCriarUnidadeTerritorial,
  casoLiderancaDaSede,
  permissionsOfRole,
  resolverMenuIdDeRota,
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

  it('cargo de sistema ignora array gravado defasado (Achado 1)', () => {
    const perms = permissionsOfRole(
      {
        nome: SYSTEM_ROLES.OWNER,
        permissions: [],
        permissionsExtras: [PERMISSIONS.COMMUNITY_POST],
        departamentoId: 'd1',
        papelNoDepartamento: 'GESTOR',
      },
      {
        permissions: [PERMISSIONS.FINANCE_VIEW],
        permissionsGestor: [PERMISSIONS.FINANCE_MANAGE],
      },
    )
    expect(perms).toEqual(expect.arrayContaining(SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.OWNER]))
    expect(perms).toContain(PERMISSIONS.BAR_MANAGE)
    expect(perms).toContain(PERMISSIONS.SETTINGS_MANAGE)
  })

  it('member de sistema usa a constante mesmo com permissions vazias no Role', () => {
    const perms = permissionsOfRole(
      {
        nome: SYSTEM_ROLES.MEMBER,
        permissions: [],
        permissionsExtras: [],
        departamentoId: null,
      },
      null,
    )
    expect(perms).toEqual(SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.MEMBER])
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

  it('uma torcida admite no máximo 1 presidente', () => {
    expect(MAX_PRESIDENTES).toBe(1)
  })

  it('vice só existe no tenant da Sede principal (tipo SEDE)', () => {
    expect(podeTerVice('SEDE')).toBe(true)
    expect(podeTerVice('SUBSEDE')).toBe(false)
    expect(podeTerVice('PONTO_ENCONTRO')).toBe(false)
  })

  it('criar unidade territorial só na Sede principal', () => {
    expect(podeCriarUnidadeTerritorial('SEDE')).toBe(true)
    expect(podeCriarUnidadeTerritorial('SUBSEDE')).toBe(false)
    expect(podeCriarUnidadeTerritorial('PONTO_ENCONTRO')).toBe(false)
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

describe('afiliação de unidades (AFFILIATION_MANAGE)', () => {
  it('owner (Presidente) e vice decidem afiliação; admin comum NÃO', () => {
    const ownerPermissions = SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.OWNER]
    const vicePermissions = SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.VICE]
    const adminPermissions = SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.ADMIN]

    expect(ownerPermissions).toContain(PERMISSIONS.AFFILIATION_MANAGE)
    expect(vicePermissions).toContain(PERMISSIONS.AFFILIATION_MANAGE)
    expect(adminPermissions).not.toContain(PERMISSIONS.AFFILIATION_MANAGE)
  })
})

describe('casoLiderancaDaSede', () => {
  it('Sede raiz (cara do tenant) é Caso B — cargo owner', () => {
    expect(
      casoLiderancaDaSede({ tipo: 'SEDE', tenantId: 't1', parentTenantId: null }),
    ).toBe('B')
  })

  it('subsede/PDE no mesmo tenant é Caso A — responsavelUserId', () => {
    expect(
      casoLiderancaDaSede({ tipo: 'SUBSEDE', tenantId: 't1', parentTenantId: 't1' }),
    ).toBe('A')
    expect(
      casoLiderancaDaSede({ tipo: 'PONTO_ENCONTRO', tenantId: 't1', parentTenantId: 't1' }),
    ).toBe('A')
  })

  it('unidade promovida (pai em outro tenant) é Caso B', () => {
    expect(
      casoLiderancaDaSede({ tipo: 'SUBSEDE', tenantId: 't-filho', parentTenantId: 't-mae' }),
    ).toBe('B')
  })

  it('sem tenantId não tem cargo — Caso A', () => {
    expect(casoLiderancaDaSede({ tipo: 'SEDE', tenantId: null, parentTenantId: null })).toBe('A')
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
    // `member` é o vínculo base: "Sócio". "Membro" só quem compõe departamento.
    expect(rotuloCargoSistema('member', 'SEDE')).toBe('Sócio')
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
    expect(hrefHomeDepartamento('financeiro', 'painel')).toBe('/portal/departamentos/financeiro')
    expect(hrefHomeDepartamento('financeiro', 'projetos')).toBe(
      '/portal/departamentos/financeiro/projetos',
    )
    expect(hrefHomeDepartamento('social-e-eventos', 'areas', { area: 'area-1' })).toBe(
      '/portal/departamentos/social-e-eventos/areas/area-1',
    )
    expect(hrefHomeDepartamento('social-e-eventos', undefined, { projeto: 'proj-1' })).toBe(
      '/portal/departamentos/social-e-eventos/projetos/proj-1',
    )
    expect(hrefHomeDepartamento('bateria', undefined, { pessoa: 'user-1' })).toBe(
      '/portal/departamentos/bateria?tab=equipe&pessoa=user-1',
    )
    expect(hrefModuloPortal('eventos')).toBe('/portal/eventos')
    expect(hrefModuloPortal('financeiro')).toBe('/portal/financeiro')
    expect(hrefModuloPortal('patrimonio')).toBe('/portal/patrimonio')
    expect(hrefModuloPortal('caravanas')).toBe('/portal/eventos?tipo=CARAVANA')
    expect(hrefModuloPortal('bateria')).toBe('/portal/eventos?tipo=ENSAIO')
    expect(hrefOperacaoAdmin('financeiro')).toBe('/admin/financeiro')
    expect(hrefOperacaoAdmin('patrimonio')).toBe('/admin/patrimonio')
    expect(hrefOperacaoAdmin('bateria')).toBe('/admin/bateria')
    expect(hrefOperacaoAdmin('caravanas')).toBe('/admin/caravanas')
    expect(hrefModuloPortal('social')).toBe('/portal/eventos')
    expect(hrefModuloPortal('carnaval')).toBe('/portal/eventos')
    expect(hrefOperacaoAdmin('social')).toBe('/admin/social')
    expect(hrefOperacaoAdmin('carnaval')).toBe('/admin/carnaval')
    expect(hrefModuloPortal('feminino')).toBe('/portal/eventos')
    expect(hrefOperacaoAdmin('feminino')).toBe('/admin/feminino')
    expect(hrefOperacaoAdmin('diretoria')).toBe('/admin/diretoria')
    expect(hrefModuloPortal('diretoria')).toBeNull()
    expect(capabilityPorSlug('bateria')?.portalPanel).toBe('bateria')
    expect(capabilityPorSlug('patrimonio')?.portalPanel).toBe('patrimonio')
    expect(capabilityPorSlug('caravanas')?.moduloPortal).toBe('caravanas')
    expect(capabilityPorSlug('bateria')?.moduloPortal).toBe('bateria')
    expect(capabilityPorSlug('social-e-eventos')?.moduloPortal).toBe('social')
    expect(capabilityPorSlug('carnaval')?.moduloPortal).toBe('carnaval')
    expect(capabilityPorSlug('carnaval')?.portalPanel).toBe('carnaval')
    expect(capabilityPorSlug('feminino')?.moduloPortal).toBe('feminino')
    expect(capabilityPorSlug('diretoria')?.moduloPortal).toBe('diretoria')
    // Bandeiras não tem módulo de portal próprio: é o inventário recortado.
    expect(capabilityPorSlug('bandeiras')?.portalPanel).toBe('bandeiras')
    expect(hrefModuloPortal('bandeiras')).toBe('/portal/patrimonio?categoria=BANDEIRA')
    expect(hrefOperacaoAdmin('bandeiras')).toBe('/admin/bandeiras')
  })

  it('Torcedor e Sócio não são departamentos (slug ou nome)', () => {
    expect(isDepartamentoLegado('torcedor')).toBe(true)
    expect(isDepartamentoLegado('socio')).toBe(true)
    expect(isDepartamentoLegado('TORCEDOR')).toBe(true)
    expect(isDepartamentoLegado({ slug: 'x', nome: 'Torcedor' })).toBe(true)
    expect(isDepartamentoLegado({ slug: 'financeiro', nome: 'Financeiro' })).toBe(false)
    expect(isDepartamentoLegado('financeiro')).toBe(false)
    expect(isDepartamentoLegado(null, 'Sócio')).toBe(true)
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

  it('ADMIN_MENU: members:approve vê Torcedores e Sócios; messages:moderate vê Moderação', () => {
    const soAprovar = filterMenuByPermissions(ADMIN_MENU, [PERMISSIONS.MEMBERS_APPROVE])
    expect(soAprovar.map((i) => i.id)).toContain('torcedores')
    expect(soAprovar.map((i) => i.id)).toContain('socios')

    // Moderação virou tab de /admin/comunidade: o menu mostra o módulo, e o
    // módulo leva o moderador direto para a etapa dele.
    const soMsgMod = filterMenuByPermissions(ADMIN_MENU, [PERMISSIONS.MESSAGES_MODERATE])
    expect(soMsgMod.map((i) => i.id)).toContain('comunidade')
  })

  it('ADMIN_MENU: pacote Financeiro (membro) abre Bar/PDV e Relatórios — não o livro-caixa', () => {
    const financeiro = DEPARTAMENTOS_CANONICOS.find((a) => a.nome === 'Financeiro')
    expect(financeiro).toBeTruthy()
    const ids = filterMenuByPermissions(ADMIN_MENU, financeiro!.permissions).map((i) => i.id)
    expect(ids).toEqual(expect.arrayContaining(['dashboard', 'relatorios', 'bar', 'bar-pdv']))
    expect(ids).not.toContain('financeiro')
    expect(ids).not.toContain('torcedores')
  })

  it('ADMIN_MENU: finance:manage abre Financeiro; events:manage abre Agenda (hubs thin exigem gestoria)', () => {
    expect(
      filterMenuByPermissions(ADMIN_MENU, [PERMISSIONS.FINANCE_MANAGE]).map((i) => i.id),
      // Cobranças e planos são tabs de /admin/financeiro — uma entrada só.
    ).toEqual(['dashboard', 'financeiro'])
    expect(
      filterMenuByPermissionsAndGestoria(ADMIN_MENU, [PERMISSIONS.EVENTS_MANAGE], {
        gestorSlugs: [],
      }).map((i) => i.id),
    ).toEqual(['dashboard', 'eventos'])
    expect(
      filterMenuByPermissionsAndGestoria(ADMIN_MENU, [PERMISSIONS.EVENTS_CREATE], {
        gestorSlugs: ['caravanas'],
      }).map((i) => i.id),
    ).toEqual(['dashboard', 'caravanas'])
  })

  it('hubs thin: gestor de caravanas vê Caravanas, não Bateria/Social; roles:manage vê todos', () => {
    const permsEventos = [PERMISSIONS.EVENTS_VIEW, PERMISSIONS.EVENTS_MANAGE]
    const soCaravanas = filterMenuByPermissionsAndGestoria(ADMIN_MENU, permsEventos, {
      gestorSlugs: ['caravanas'],
    }).map((i) => i.id)
    expect(soCaravanas).toEqual(expect.arrayContaining(['dashboard', 'eventos', 'caravanas']))
    expect(soCaravanas).not.toContain('bateria')
    expect(soCaravanas).not.toContain('social')
    expect(soCaravanas).not.toContain('feminino')
    expect(soCaravanas).not.toContain('carnaval')

    const todos = filterMenuByPermissionsAndGestoria(ADMIN_MENU, permsEventos, {
      podeGerirTodos: true,
    }).map((i) => i.id)
    expect(todos).toEqual(
      expect.arrayContaining(['caravanas', 'bateria', 'social', 'feminino', 'carnaval']),
    )
  })

  it('Bandeiras: só o gestor da área abre /admin/bandeiras; flags:view nunca', () => {
    const colaborador = filterMenuByPermissionsAndGestoria(ADMIN_MENU, [PERMISSIONS.FLAGS_VIEW], {
      gestorSlugs: ['bandeiras'],
    }).map((i) => i.id)
    expect(colaborador).toEqual(['dashboard'])

    const gestor = filterMenuByPermissionsAndGestoria(ADMIN_MENU, [PERMISSIONS.FLAGS_MANAGE], {
      gestorSlugs: ['bandeiras'],
    }).map((i) => i.id)
    expect(gestor).toContain('bandeiras')

    // `flags:manage` sem gestoria da área (ex.: override solto) não abre o hub,
    // como já vale para Caravanas/Bateria.
    const semGestoria = filterMenuByPermissionsAndGestoria(
      ADMIN_MENU,
      [PERMISSIONS.FLAGS_MANAGE],
      { gestorSlugs: [] },
    ).map((i) => i.id)
    expect(semGestoria).not.toContain('bandeiras')

    // Gestor de bandeiras não vê o módulo Patrimônio (inventário geral).
    const efetivas = [
      ...DEPARTAMENTOS_CANONICOS.find((d) => d.nome === 'Bandeiras')!.permissions,
      ...DEPARTAMENTOS_CANONICOS.find((d) => d.nome === 'Bandeiras')!.permissionsGestor,
    ]
    expect(
      filterMenuByPermissionsAndGestoria(ADMIN_MENU, efetivas, {
        gestorSlugs: ['bandeiras'],
      }).map((i) => i.id),
    ).not.toContain('patrimonio')
  })

  it('resolverMenuIdDeRota: hubs thin de departamento', () => {
    expect(resolverMenuIdDeRota('/admin/bandeiras')).toBe('bandeiras')
    expect(resolverMenuIdDeRota('/admin/caravanas')).toBe('caravanas')
    expect(resolverMenuIdDeRota('/admin/caravanas/abc')).toBe('caravanas')
    expect(resolverMenuIdDeRota('/admin/bateria')).toBe('bateria')
    expect(resolverMenuIdDeRota('/admin/diretoria')).toBe('diretoria')
  })

  it('hierarquia exige roles:manage (não members:view)', () => {
    const soMembers = filterMenuByPermissionsAndGestoria(
      ADMIN_MENU,
      [PERMISSIONS.MEMBERS_VIEW],
      { gestorSlugs: [] },
    ).map((i) => i.id)
    expect(soMembers).toContain('torcedores')
    expect(soMembers).toContain('socios')
    expect(soMembers).not.toContain('diretoria')
    expect(soMembers).not.toContain('hierarquia')
  })

  it('groupAdminMenuBySecao omite seções vazias e agrupa por módulo', () => {
    const items = filterMenuByPermissions(ADMIN_MENU, [
      PERMISSIONS.FINANCE_MANAGE,
      PERMISSIONS.MEMBERS_VIEW,
    ]).map((i) => ({ id: i.id, label: i.label, href: i.href, secao: i.secao }))
    const groups = groupAdminMenuBySecao(items)
    // members:view também casa o hub Diretoria (departamentoSlug) — ainda na
    // seção operação; o filtro de gestoria é aplicado no layout.
    expect(groups.map((g) => g.id)).toEqual(['geral', 'pessoas', 'operacao', 'financas'])
    expect(groups.find((g) => g.id === 'financas')?.label).toBe('Finanças')
  })

  it('Fase 2: pacote colaborador de área canônica não abre operação admin (exceto Diretoria, Bar/PDV e Relatórios)', () => {
    for (const area of DEPARTAMENTOS_CANONICOS) {
      const ids = filterMenuByPermissionsAndGestoria(ADMIN_MENU, area.permissions, {
        gestorSlugs: [],
      }).map((i) => i.id)
      if (area.nome === 'Diretoria') {
        const esperado = new Set([
          'dashboard',
          'estrutura',
          'torcedores',
          'socios',
          'portaria',
          'eventos',
          'loja',
          'comunidade',
          'financeiro',
          'patrimonio',
          'relatorios',
          'plataforma',
        ])
        expect(new Set(ids), area.nome).toEqual(esperado)
        expect(hasAdminAreaAccess(area.permissions), area.nome).toBe(true)
        continue
      }
      const esperado = new Set(['dashboard'])
      if (area.permissions.includes(PERMISSIONS.REPORTS_VIEW)) esperado.add('relatorios')
      if (area.permissions.includes(PERMISSIONS.BAR_OPERATE)) {
        esperado.add('bar')
        esperado.add('bar-pdv')
      }
      expect(new Set(ids), area.nome).toEqual(esperado)
      expect(hasAdminAreaAccess(area.permissions), area.nome).toBe(esperado.size > 1)
    }
  })

  it('Membro · Diretoria: menu de visão sem perms de mutação', () => {
    const diretoria = DEPARTAMENTOS_CANONICOS.find((a) => a.nome === 'Diretoria')!
    expect(diretoria.permissions).toContain(PERMISSIONS.EVENTS_VIEW)
    expect(diretoria.permissions).toContain(PERMISSIONS.COMMUNITY_VIEW)
    expect(diretoria.permissions).toContain(PERMISSIONS.SEDES_VIEW)
    expect(diretoria.permissions).toContain(PERMISSIONS.MEMBERS_VIEW)
    expect(diretoria.permissions).not.toContain(PERMISSIONS.MEMBERS_APPROVE)
    expect(diretoria.permissions).not.toContain(PERMISSIONS.EVENTS_MANAGE)
    expect(diretoria.permissions).not.toContain(PERMISSIONS.FINANCE_MANAGE)
    expect(diretoria.permissions).not.toContain(PERMISSIONS.SEDES_MANAGE)
    expect(diretoria.permissions).not.toContain(PERMISSIONS.ANNOUNCEMENTS_PUBLISH)
    expect(diretoria.permissionsGestor).toContain(PERMISSIONS.MEMBERS_APPROVE)
    expect(diretoria.permissionsGestor).toContain(PERMISSIONS.SEDES_MANAGE)
  })

  it('cascata: ops de comunidade puxam community:view; post não', () => {
    const comManage = applyPermissionCascade([], [PERMISSIONS.COMMUNITY_MANAGE])
    expect(comManage).toContain(PERMISSIONS.COMMUNITY_VIEW)
    const soPost = applyPermissionCascade([], [PERMISSIONS.COMMUNITY_POST])
    expect(soPost).not.toContain(PERMISSIONS.COMMUNITY_VIEW)
  })

  it('finance:view sozinho não abre admin; view+audit (Diretoria) abre', () => {
    expect(
      filterMenuByPermissions(ADMIN_MENU, [PERMISSIONS.FINANCE_VIEW]).map((i) => i.id),
    ).toEqual(['dashboard'])
    expect(
      filterMenuByPermissions(ADMIN_MENU, [
        PERMISSIONS.FINANCE_VIEW,
        PERMISSIONS.AUDIT_VIEW,
      ]).map((i) => i.id),
    ).toEqual(expect.arrayContaining(['financeiro', 'plataforma']))
  })

  it('Fase 2: gestor de cada área canônica ganha ao menos um item admin além do dashboard', () => {
    for (const area of DEPARTAMENTOS_CANONICOS) {
      const efetivas = [...area.permissions, ...area.permissionsGestor]
      expect(hasAdminAreaAccess(efetivas), area.nome).toBe(true)
      const slug = area.moduloPortal
        ? // moduloPortal ≠ slug canônico em alguns casos (social → social-e-eventos)
          capabilityPorSlug(
            area.nome === 'Social e eventos'
              ? 'social-e-eventos'
              : area.nome === 'Materiais / Loja'
                ? 'materiais-loja'
                : area.nome === 'Comunicação'
                  ? 'comunicacao'
                  : area.moduloPortal,
          )?.slug
        : undefined
      const gestorSlugs = slug ? [slug] : []
      const ids = filterMenuByPermissionsAndGestoria(ADMIN_MENU, efetivas, {
        gestorSlugs,
      }).map((i) => i.id)
      expect(ids.length, area.nome).toBeGreaterThan(1)
    }
  })

  it('matriz: Bar no Financeiro; import na Diretoria; post_nacional na Comunicação', () => {
    const porNome = Object.fromEntries(DEPARTAMENTOS_CANONICOS.map((a) => [a.nome, a]))
    expect(porNome.Financeiro.permissions).toContain(PERMISSIONS.BAR_OPERATE)
    expect(porNome.Financeiro.permissionsGestor).toContain(PERMISSIONS.BAR_MANAGE)
    expect(porNome.Diretoria.permissionsGestor).toContain(PERMISSIONS.MEMBERS_IMPORT)
    expect(porNome.Comunicação.permissionsGestor).toContain(PERMISSIONS.COMMUNITY_POST_NACIONAL)
    expect(SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.OWNER]).toContain(
      PERMISSIONS.COMMUNITY_POST_NACIONAL,
    )
    expect(SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.VICE]).toContain(
      PERMISSIONS.COMMUNITY_POST_NACIONAL,
    )
    // Gestores operacionais não são mini-admin transversais
    for (const nome of ['Caravanas', 'Carnaval', 'Patrimônio', 'Bateria', 'Feminino', 'Bandeiras']) {
      expect(porNome[nome].permissionsGestor, nome).not.toContain(PERMISSIONS.SEDES_MANAGE)
      expect(porNome[nome].permissionsGestor, nome).not.toContain(PERMISSIONS.STORE_MANAGE)
      expect(porNome[nome].permissionsGestor, nome).not.toContain(PERMISSIONS.FINANCE_MANAGE)
    }
  })
})

describe('members:purge — hard delete fica só com o Presidente', () => {
  it('owner tem, admin e vice NÃO herdam', () => {
    // `ALL_PERMISSIONS` é a base dos pacotes de admin e vice: sem a exclusão
    // explícita em SYSTEM_ROLE_PERMISSIONS, os dois ganhariam a permissão de
    // graça na próxima vez que alguém mexer nessa lista.
    expect(SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.OWNER]).toContain(PERMISSIONS.MEMBERS_PURGE)
    expect(SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.ADMIN]).not.toContain(
      PERMISSIONS.MEMBERS_PURGE,
    )
    expect(SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.VICE]).not.toContain(PERMISSIONS.MEMBERS_PURGE)
  })

  it('bloquear (members:block) segue com admin e vice — é operação de rotina', () => {
    expect(SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.ADMIN]).toContain(PERMISSIONS.MEMBERS_BLOCK)
    expect(SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.VICE]).toContain(PERMISSIONS.MEMBERS_BLOCK)
  })
})
