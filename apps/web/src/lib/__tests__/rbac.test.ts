import { describe, expect, it } from 'vitest'
import { calculateEffectivePermissions, hasPermission, PERMISSIONS, WILDCARD_PERMISSION } from '@torcida/types'

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
