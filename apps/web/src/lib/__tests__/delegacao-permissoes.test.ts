import { describe, expect, it } from 'vitest'
import {
  ALL_PERMISSIONS,
  labelPermission,
  permissionsOfRole,
  permissoesForaDoAlcance,
  PERMISSIONS,
  SYSTEM_ROLE_PERMISSIONS,
  SYSTEM_ROLES,
  WILDCARD_PERMISSION,
} from '@torcida/types'

/**
 * Achado 6 — `roles:manage` sem limite de delegação equivale a owner: o
 * portador fabrica um cargo com qualquer permissão do catálogo, veste, e
 * escala. O invariante testado aqui é "ninguém concede o que não tem", e o
 * caso que dá nome ao achado é `settings:manage`, que
 * `SYSTEM_ROLE_PERMISSIONS` tira de `admin` e `vice` de propósito.
 */
describe('permissoesForaDoAlcance', () => {
  it('não acusa nada quando o ator tem tudo que quer conceder', () => {
    const ator = [PERMISSIONS.MEMBERS_VIEW, PERMISSIONS.MEMBERS_APPROVE]
    expect(permissoesForaDoAlcance(ator, [PERMISSIONS.MEMBERS_VIEW])).toEqual([])
    expect(permissoesForaDoAlcance(ator, ator)).toEqual([])
  })

  it('acusa exatamente o que passa do conjunto do ator', () => {
    const ator = [PERMISSIONS.MEMBERS_VIEW, PERMISSIONS.ROLES_MANAGE]
    const fora = permissoesForaDoAlcance(ator, [
      PERMISSIONS.MEMBERS_VIEW,
      PERMISSIONS.SETTINGS_MANAGE,
      PERMISSIONS.FINANCE_MANAGE,
    ])
    expect(fora).toEqual([PERMISSIONS.SETTINGS_MANAGE, PERMISSIONS.FINANCE_MANAGE])
  })

  it('owner delega tudo — o wildcard cobre o catálogo inteiro', () => {
    expect(permissoesForaDoAlcance([WILDCARD_PERMISSION], [...ALL_PERMISSIONS])).toEqual([])
  })

  it('conjunto vazio não concede nada', () => {
    expect(permissoesForaDoAlcance([], [PERMISSIONS.MEMBERS_VIEW])).toEqual([
      PERMISSIONS.MEMBERS_VIEW,
    ])
  })

  it('não duplica na saída quando a mesma permissão vem repetida', () => {
    const fora = permissoesForaDoAlcance(
      [],
      [PERMISSIONS.SETTINGS_MANAGE, PERMISSIONS.SETTINGS_MANAGE],
    )
    expect(fora).toEqual([PERMISSIONS.SETTINGS_MANAGE])
  })

  it('admin NÃO delega settings:manage — é a fronteira do Achado 6', () => {
    const admin = SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.ADMIN]
    expect(admin).not.toContain(PERMISSIONS.SETTINGS_MANAGE)
    expect(permissoesForaDoAlcance(admin, [PERMISSIONS.SETTINGS_MANAGE])).toEqual([
      PERMISSIONS.SETTINGS_MANAGE,
    ])
  })

  it('vice tem a mesma fronteira que admin quanto a settings:manage', () => {
    const vice = SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.VICE]
    expect(permissoesForaDoAlcance(vice, [PERMISSIONS.SETTINGS_MANAGE])).toEqual([
      PERMISSIONS.SETTINGS_MANAGE,
    ])
  })

  it('admin não consegue atribuir o cargo de sistema owner (pacote inteiro)', () => {
    const admin = SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.ADMIN]
    const pacoteOwner = permissionsOfRole(
      { permissions: SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.OWNER], permissionsExtras: [] },
      null,
    )
    expect(permissoesForaDoAlcance(admin, pacoteOwner).length).toBeGreaterThan(0)
  })

  it('admin continua atribuindo o próprio cargo admin — o limite não trava a operação', () => {
    const admin = SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.ADMIN]
    const pacoteAdmin = permissionsOfRole({ permissions: admin, permissionsExtras: [] }, null)
    expect(permissoesForaDoAlcance(admin, pacoteAdmin)).toEqual([])
  })

  it('admin continua atribuindo o cargo member', () => {
    const admin = SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.ADMIN]
    const pacoteMember = permissionsOfRole(
      { permissions: SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.MEMBER], permissionsExtras: [] },
      null,
    )
    expect(permissoesForaDoAlcance(admin, pacoteMember)).toEqual([])
  })

  it('owner atribui qualquer cargo de sistema', () => {
    const owner = SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.OWNER]
    for (const nome of Object.values(SYSTEM_ROLES)) {
      const pacote = permissionsOfRole(
        { permissions: SYSTEM_ROLE_PERMISSIONS[nome] ?? [], permissionsExtras: [] },
        null,
      )
      expect(permissoesForaDoAlcance(owner, pacote)).toEqual([])
    }
  })
})

describe('labelPermission', () => {
  it('traduz permissão catalogada', () => {
    expect(labelPermission(PERMISSIONS.SETTINGS_MANAGE)).not.toBe(PERMISSIONS.SETTINGS_MANAGE)
    expect(labelPermission(PERMISSIONS.SETTINGS_MANAGE).length).toBeGreaterThan(0)
  })

  it('toda permissão do catálogo tem rótulo próprio — mensagem nunca cospe a chave crua', () => {
    const semRotulo = ALL_PERMISSIONS.filter((p) => labelPermission(p) === p)
    expect(semRotulo).toEqual([])
  })

  it('cai na própria chave quando a permissão não existe', () => {
    expect(labelPermission('inexistente:xyz')).toBe('inexistente:xyz')
  })
})
