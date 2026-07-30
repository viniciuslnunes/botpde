/**
 * Plano puro para o modo `--permissions-only` do repair de cargos de sistema.
 * Sem Prisma — só cálculo/comparação do array canônico a gravar.
 *
 * Espelha onde `bootstrapAcessoTenant` guarda o pacote:
 * - owner/admin/vice → `permissionsExtras` (com `departamentoId`; `permissionsOfRole`
 *   ignora `permissions` nesse caso)
 * - member → `permissions` (transversal)
 */

import { SYSTEM_ROLES } from '../../types/src/permissions.js'

/** @typedef {'permissions' | 'permissionsExtras'} CampoPacoteSistema */

/** @type {readonly string[]} */
export const SYSTEM_ROLE_NOMES = Object.freeze([
  SYSTEM_ROLES.OWNER,
  SYSTEM_ROLES.ADMIN,
  SYSTEM_ROLES.VICE,
  SYSTEM_ROLES.MEMBER,
])

const NOMES_SET = new Set(SYSTEM_ROLE_NOMES)

/**
 * @param {string} nome
 * @returns {nome is 'owner' | 'admin' | 'vice' | 'member'}
 */
export function isSystemRoleNome(nome) {
  return typeof nome === 'string' && NOMES_SET.has(nome)
}

/**
 * Campo onde o bootstrap grava `SYSTEM_ROLE_PERMISSIONS[nome]`.
 * @param {string} nome
 * @returns {CampoPacoteSistema | null}
 */
export function campoPacoteSistema(nome) {
  if (!isSystemRoleNome(nome)) return null
  return nome === SYSTEM_ROLES.MEMBER ? 'permissions' : 'permissionsExtras'
}

/**
 * Compara dois arrays de permissão como conjuntos (ordem irrelevante).
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
export function samePermissionSet(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false
  /** @type {string[]} */
  const left = []
  /** @type {string[]} */
  const right = []
  for (const item of a) {
    if (typeof item !== 'string') return false
    left.push(item)
  }
  for (const item of b) {
    if (typeof item !== 'string') return false
    right.push(item)
  }
  if (left.length !== right.length) return false
  const setB = new Set(right)
  if (setB.size !== right.length) {
    // duplicatas em b: comparar multiconjunto via sort
    const sa = [...left].sort()
    const sb = [...right].sort()
    return sa.every((v, i) => v === sb[i])
  }
  for (const p of left) {
    if (!setB.has(p)) return false
  }
  return true
}

/**
 * @param {unknown} catalog
 * @param {string} nome
 * @returns {string[] | null}
 */
export function expectedPermissionsFor(catalog, nome) {
  if (!isSystemRoleNome(nome)) return null
  if (!catalog || typeof catalog !== 'object') return null
  const raw = /** @type {Record<string, unknown>} */ (catalog)[nome]
  if (!Array.isArray(raw) || raw.length === 0) return null
  /** @type {string[]} */
  const out = []
  for (const item of raw) {
    if (typeof item !== 'string' || item.length === 0) return null
    out.push(item)
  }
  return out
}

/**
 * @typedef {{
 *   id: string
 *   nome: string
 *   permissions: unknown
 *   permissionsExtras: unknown
 * }} SystemRoleRow
 *
 * @typedef {{
 *   id: string
 *   nome: string
 *   field: CampoPacoteSistema
 *   next: string[]
 * }} SystemRolePermissionUpdate
 *
 * @typedef {{
 *   nome: string
 *   field: CampoPacoteSistema
 *   next: string[]
 *   ids: string[]
 * }} SystemRolePermissionBatch
 */

/**
 * Retorna o update a aplicar, ou `null` se o cargo já está em dia / inválido.
 *
 * @param {SystemRoleRow} role
 * @param {unknown} catalog - `SYSTEM_ROLE_PERMISSIONS`
 * @returns {SystemRolePermissionUpdate | null}
 */
export function planSystemRolePermissionUpdate(role, catalog) {
  if (!role || typeof role.id !== 'string' || !isSystemRoleNome(role.nome)) {
    return null
  }
  const field = campoPacoteSistema(role.nome)
  const expected = expectedPermissionsFor(catalog, role.nome)
  if (!field || !expected) return null

  const current = field === 'permissions' ? role.permissions : role.permissionsExtras
  if (!Array.isArray(current)) {
    return { id: role.id, nome: role.nome, field, next: expected }
  }
  if (samePermissionSet(current, expected)) return null
  return { id: role.id, nome: role.nome, field, next: expected }
}

/**
 * Agrega contagens por cargo a partir das rows e do plano.
 *
 * @param {SystemRoleRow[]} roles
 * @param {unknown} catalog
 * @returns {{
 *   updates: SystemRolePermissionUpdate[]
 *   porCargo: Record<string, { encontrados: number, desatualizados: number }>
 * }}
 */
export function buildPermissionsOnlyPlan(roles, catalog) {
  /** @type {Record<string, { encontrados: number, desatualizados: number }>} */
  const porCargo = {}
  for (const nome of SYSTEM_ROLE_NOMES) {
    porCargo[nome] = { encontrados: 0, desatualizados: 0 }
  }

  /** @type {SystemRolePermissionUpdate[]} */
  const updates = []
  for (const role of roles) {
    if (!isSystemRoleNome(role.nome)) continue
    porCargo[role.nome].encontrados += 1
    const plan = planSystemRolePermissionUpdate(role, catalog)
    if (plan) {
      porCargo[role.nome].desatualizados += 1
      updates.push(plan)
    }
  }
  return { updates, porCargo }
}

/**
 * Colapsa os updates em **um lote por cargo** — o array canônico é o mesmo
 * para todas as rows de um cargo, então cada lote vira um único `updateMany`
 * (no máximo 4 statements: owner, admin, vice, member).
 *
 * @param {SystemRolePermissionUpdate[]} updates
 * @returns {SystemRolePermissionBatch[]}
 */
export function agruparUpdatesPorCargo(updates) {
  /** @type {Map<string, SystemRolePermissionBatch>} */
  const porCargo = new Map()

  for (const u of updates) {
    if (!isSystemRoleNome(u.nome)) continue
    const existente = porCargo.get(u.nome)
    if (existente) {
      if (existente.field !== u.field || !samePermissionSet(existente.next, u.next)) {
        throw new Error(
          `Plano inconsistente para o cargo '${u.nome}': campo/array divergente entre rows`,
        )
      }
      existente.ids.push(u.id)
      continue
    }
    porCargo.set(u.nome, {
      nome: u.nome,
      field: u.field,
      next: [...u.next],
      ids: [u.id],
    })
  }

  return SYSTEM_ROLE_NOMES.map((nome) => porCargo.get(nome)).filter(
    /** @returns {batch is SystemRolePermissionBatch} */
    (batch) => Boolean(batch),
  )
}
