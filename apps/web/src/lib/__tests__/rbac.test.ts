import { describe, expect, it } from 'vitest'
import {
  calculateEffectivePermissions,
  DEPARTAMENTO_MODULO_ROTA,
  DEPARTAMENTO_MODULOS,
  hasPermission,
  MAX_VICE_PRESIDENTES,
  PERMISSIONS,
  podeTerVice,
  rotuloCargoMaximo,
  rotuloCargoSistema,
  SYSTEM_ROLE_PERMISSIONS,
  SYSTEM_ROLES,
  WILDCARD_PERMISSION,
} from '@torcida/types'

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

  it('módulo disponível tem href; indisponível não tem', () => {
    for (const rota of Object.values(DEPARTAMENTO_MODULO_ROTA)) {
      if (rota.disponivel) {
        expect(rota.href).toBeTruthy()
      } else {
        expect(rota.href).toBeNull()
      }
    }
  })
})
