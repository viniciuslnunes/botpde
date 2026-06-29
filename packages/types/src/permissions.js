/**
 * Lista global de permissões da plataforma.
 * Imutável — novas permissões são adicionadas aqui e automaticamente
 * disponíveis para serem atribuídas a cargos.
 */
export const PERMISSIONS = /** @type {const} */ ({
  // Membros
  MEMBERS_VIEW: 'members:view',
  MEMBERS_APPROVE: 'members:approve',
  MEMBERS_REJECT: 'members:reject',
  MEMBERS_WARN: 'members:warn',
  MEMBERS_BLOCK: 'members:block',

  // Loja
  STORE_VIEW_ORDERS: 'store:view_orders',
  STORE_MANAGE: 'store:manage',

  // Eventos
  EVENTS_CREATE: 'events:create',
  EVENTS_MANAGE: 'events:manage',

  // Sedes
  SEDES_MANAGE: 'sedes:manage',

  // Cargos (admin only)
  ROLES_MANAGE: 'roles:manage',

  // Configurações (owner only)
  SETTINGS_MANAGE: 'settings:manage',

  // Relatórios
  REPORTS_VIEW: 'reports:view',
})

export const ALL_PERMISSIONS = Object.values(PERMISSIONS)

/**
 * Cargos reservados do sistema — não podem ser editados ou removidos.
 */
export const SYSTEM_ROLES = /** @type {const} */ ({
  OWNER: 'owner',
  ADMIN: 'admin',
  MEMBER: 'member',
})

/**
 * Permissões padrão por cargo do sistema.
 */
export const SYSTEM_ROLE_PERMISSIONS = {
  [SYSTEM_ROLES.OWNER]: ALL_PERMISSIONS,
  [SYSTEM_ROLES.ADMIN]: ALL_PERMISSIONS.filter(
    (p) => p !== PERMISSIONS.SETTINGS_MANAGE,
  ),
  [SYSTEM_ROLES.MEMBER]: [],
}

/**
 * Calcula permissões efetivas de um usuário.
 * Prioridade: overrides individuais > union de cargos
 *
 * @param {string[]} rolePermissions - permissões acumuladas de todos os cargos
 * @param {{ permission: string, granted: boolean }[]} overrides - permissões individuais
 * @returns {string[]} lista de permissões efetivas
 */
export function calculateEffectivePermissions(rolePermissions, overrides) {
  const base = new Set(rolePermissions)

  for (const override of overrides) {
    if (override.granted) {
      base.add(override.permission)
    } else {
      base.delete(override.permission)
    }
  }

  return Array.from(base)
}

/**
 * Verifica se uma lista de permissões efetivas inclui uma permissão.
 *
 * @param {string[]} effectivePermissions
 * @param {string} permission
 * @returns {boolean}
 */
export function hasPermission(effectivePermissions, permission) {
  return effectivePermissions.includes(permission)
}
