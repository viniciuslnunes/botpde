import { describe, expect, it } from 'vitest'
import {
  ADMIN_MODULOS,
  PERMISSIONS,
  SYSTEM_ROLE_PERMISSIONS,
  SYSTEM_ROLES,
  labelPermission,
  permissionsOfRole,
  tabsPermitidasDoModulo,
} from '@torcida/types'

/**
 * Troca de gestão (`lib/lideranca.ts` + aba Estrutura › Presidência).
 *
 * Presidente de torcida não é vitalício — a gestão troca a cada 3–4 anos — e
 * antes disso a única forma de mexer em quem lidera era o super-admin. Os
 * invariantes abaixo protegem a fronteira que a feature desenha: quem sucede é
 * escolhido por quem tem o mandato, e ninguém mais.
 */

const PACOTE_OWNER: string[] = permissionsOfRole({ nome: SYSTEM_ROLES.OWNER }, null)
const PACOTE_ADMIN: string[] = permissionsOfRole({ nome: SYSTEM_ROLES.ADMIN }, null)
const PACOTE_VICE: string[] = permissionsOfRole({ nome: SYSTEM_ROLES.VICE }, null)
const PACOTE_MEMBER: string[] = permissionsOfRole({ nome: SYSTEM_ROLES.MEMBER }, null)

describe('leadership:transfer é exclusiva do presidente', () => {
  it('está no pacote do owner', () => {
    expect(PACOTE_OWNER).toContain(PERMISSIONS.LEADERSHIP_TRANSFER)
  })

  it('NÃO está em admin, vice nem member', () => {
    // Vice substitui o presidente, não o sucede: quem escolhe quem assume é
    // quem tem o mandato. Admin opera a torcida e não decide sucessão.
    expect(PACOTE_ADMIN).not.toContain(PERMISSIONS.LEADERSHIP_TRANSFER)
    expect(PACOTE_VICE).not.toContain(PERMISSIONS.LEADERSHIP_TRANSFER)
    expect(PACOTE_MEMBER).not.toContain(PERMISSIONS.LEADERSHIP_TRANSFER)
  })

  it('vale ao vivo, sem repair do array gravado no Role', () => {
    // `permissionsOfRole` resolve cargo de sistema pelo pacote em runtime
    // (Achado 1). Se um dia isso voltar a ler o array do banco, este teste cai.
    expect(SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.OWNER]).toContain(
      PERMISSIONS.LEADERSHIP_TRANSFER,
    )
  })

  it('tem rótulo legível fora do formulário de cargos', () => {
    // A recusa de delegação mostra o rótulo ao usuário — nunca a chave crua.
    const label = labelPermission(PERMISSIONS.LEADERSHIP_TRANSFER)
    expect(label).not.toBe(PERMISSIONS.LEADERSHIP_TRANSFER)
    expect(label.length).toBeGreaterThan(0)
  })
})

describe('aba Presidência em Estrutura', () => {
  const modulo = ADMIN_MODULOS.find((m) => m.id === 'estrutura')

  it('existe como etapa do módulo, gateada pela permissão', () => {
    const tab = modulo?.tabs.find((t) => t.id === 'presidencia')
    expect(tab).toBeDefined()
    expect(tab?.href).toBe('/admin/presidencia')
    expect(tab?.permissao).toBe(PERMISSIONS.LEADERSHIP_TRANSFER)
  })

  it('some para quem não é presidente — nada de etapa bloqueada à mostra', () => {
    const tabsAdmin = tabsPermitidasDoModulo('estrutura', PACOTE_ADMIN)
    expect(tabsAdmin.map((t) => t.id)).not.toContain('presidencia')

    const tabsOwner = tabsPermitidasDoModulo('estrutura', PACOTE_OWNER)
    expect(tabsOwner.map((t) => t.id)).toContain('presidencia')
  })
})
