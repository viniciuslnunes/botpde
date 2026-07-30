/**
 * Teste puro (offline) do plano `--permissions-only`.
 *   node scripts/test-repair-system-role-permissions.js
 */
import assert from 'node:assert/strict'
import { SYSTEM_ROLE_PERMISSIONS, SYSTEM_ROLES } from '../../types/src/permissions.js'
import {
  SYSTEM_ROLE_NOMES,
  campoPacoteSistema,
  samePermissionSet,
  expectedPermissionsFor,
  planSystemRolePermissionUpdate,
  buildPermissionsOnlyPlan,
  agruparUpdatesPorCargo,
  isSystemRoleNome,
} from '../src/repair-system-role-permissions-plan.js'

let passed = 0
/** @param {string} nome @param {() => void} fn */
function ok(nome, fn) {
  fn()
  passed += 1
  console.log(`  ✓ ${nome}`)
}

ok('SYSTEM_ROLE_NOMES cobre os 4 cargos canônicos', () => {
  assert.deepEqual([...SYSTEM_ROLE_NOMES].sort(), ['admin', 'member', 'owner', 'vice'])
})

ok('isSystemRoleNome rejeita lixo', () => {
  assert.equal(isSystemRoleNome('owner'), true)
  assert.equal(isSystemRoleNome('custom'), false)
  assert.equal(isSystemRoleNome(''), false)
})

ok('campoPacoteSistema espelha bootstrap', () => {
  assert.equal(campoPacoteSistema(SYSTEM_ROLES.OWNER), 'permissionsExtras')
  assert.equal(campoPacoteSistema(SYSTEM_ROLES.ADMIN), 'permissionsExtras')
  assert.equal(campoPacoteSistema(SYSTEM_ROLES.VICE), 'permissionsExtras')
  assert.equal(campoPacoteSistema(SYSTEM_ROLES.MEMBER), 'permissions')
  assert.equal(campoPacoteSistema('nope'), null)
})

ok('samePermissionSet ignora ordem', () => {
  assert.equal(samePermissionSet(['a', 'b'], ['b', 'a']), true)
  assert.equal(samePermissionSet(['a'], ['a', 'b']), false)
  assert.equal(samePermissionSet(null, []), false)
  assert.equal(samePermissionSet([1], ['1']), false)
})

ok('expectedPermissionsFor valida catálogo', () => {
  const owner = expectedPermissionsFor(SYSTEM_ROLE_PERMISSIONS, 'owner')
  assert.ok(owner && owner.includes('bar:operate'))
  assert.equal(expectedPermissionsFor(SYSTEM_ROLE_PERMISSIONS, 'nope'), null)
  assert.equal(expectedPermissionsFor({ owner: ['ok', 2] }, 'owner'), null)
})

ok('plan: owner desatualizado atualiza permissionsExtras', () => {
  const plan = planSystemRolePermissionUpdate(
    {
      id: 'r1',
      nome: 'owner',
      permissions: [],
      permissionsExtras: ['community:post'],
    },
    SYSTEM_ROLE_PERMISSIONS,
  )
  assert.ok(plan)
  assert.equal(plan.field, 'permissionsExtras')
  assert.equal(plan.nome, 'owner')
  assert.ok(plan.next.includes('bar:manage'))
  assert.ok(plan.next.includes('members:dismiss'))
})

ok('plan: owner em dia retorna null', () => {
  const plan = planSystemRolePermissionUpdate(
    {
      id: 'r2',
      nome: 'owner',
      permissions: [],
      permissionsExtras: [...SYSTEM_ROLE_PERMISSIONS.owner],
    },
    SYSTEM_ROLE_PERMISSIONS,
  )
  assert.equal(plan, null)
})

ok('plan: member desatualizado atualiza permissions (não extras)', () => {
  const plan = planSystemRolePermissionUpdate(
    {
      id: 'r3',
      nome: 'member',
      permissions: ['community:post'],
      permissionsExtras: [],
    },
    SYSTEM_ROLE_PERMISSIONS,
  )
  assert.ok(plan)
  assert.equal(plan.field, 'permissions')
  assert.deepEqual(plan.next.slice().sort(), [...SYSTEM_ROLE_PERMISSIONS.member].sort())
})

ok('buildPermissionsOnlyPlan agrega contagens', () => {
  const { updates, porCargo } = buildPermissionsOnlyPlan(
    [
      {
        id: '1',
        nome: 'owner',
        permissions: [],
        permissionsExtras: ['x'],
      },
      {
        id: '2',
        nome: 'owner',
        permissions: [],
        permissionsExtras: [...SYSTEM_ROLE_PERMISSIONS.owner],
      },
      {
        id: '3',
        nome: 'member',
        permissions: [...SYSTEM_ROLE_PERMISSIONS.member],
        permissionsExtras: [],
      },
      {
        id: '4',
        nome: 'custom',
        permissions: [],
        permissionsExtras: [],
      },
    ],
    SYSTEM_ROLE_PERMISSIONS,
  )
  assert.equal(porCargo.owner.encontrados, 2)
  assert.equal(porCargo.owner.desatualizados, 1)
  assert.equal(porCargo.member.encontrados, 1)
  assert.equal(porCargo.member.desatualizados, 0)
  assert.equal(updates.length, 1)
  assert.equal(updates[0].id, '1')
})

ok('agruparUpdatesPorCargo colapsa em um lote por cargo', () => {
  const updates = [
    { id: 'a', nome: 'owner', field: 'permissionsExtras', next: ['p1', 'p2'] },
    { id: 'b', nome: 'owner', field: 'permissionsExtras', next: ['p2', 'p1'] },
    { id: 'c', nome: 'member', field: 'permissions', next: ['p3'] },
    { id: 'd', nome: 'owner', field: 'permissionsExtras', next: ['p1', 'p2'] },
  ]
  const lotes = agruparUpdatesPorCargo(updates)
  assert.equal(lotes.length, 2)
  // Ordem canônica: owner antes de member.
  assert.equal(lotes[0].nome, 'owner')
  assert.equal(lotes[0].field, 'permissionsExtras')
  assert.deepEqual(lotes[0].ids, ['a', 'b', 'd'])
  assert.equal(lotes[1].nome, 'member')
  assert.equal(lotes[1].field, 'permissions')
  assert.deepEqual(lotes[1].ids, ['c'])
})

ok('agruparUpdatesPorCargo nunca passa de 4 lotes', () => {
  const updates = []
  for (const nome of SYSTEM_ROLE_NOMES) {
    for (let i = 0; i < 500; i += 1) {
      const plan = planSystemRolePermissionUpdate(
        { id: `${nome}-${i}`, nome, permissions: [], permissionsExtras: [] },
        SYSTEM_ROLE_PERMISSIONS,
      )
      assert.ok(plan)
      updates.push(plan)
    }
  }
  const lotes = agruparUpdatesPorCargo(updates)
  assert.equal(lotes.length, 4)
  assert.equal(
    lotes.reduce((acc, l) => acc + l.ids.length, 0),
    updates.length,
  )
  const campos = Object.fromEntries(lotes.map((l) => [l.nome, l.field]))
  assert.equal(campos.owner, 'permissionsExtras')
  assert.equal(campos.admin, 'permissionsExtras')
  assert.equal(campos.vice, 'permissionsExtras')
  assert.equal(campos.member, 'permissions')
})

ok('agruparUpdatesPorCargo recusa plano inconsistente', () => {
  assert.throws(
    () =>
      agruparUpdatesPorCargo([
        { id: 'a', nome: 'owner', field: 'permissionsExtras', next: ['p1'] },
        { id: 'b', nome: 'owner', field: 'permissions', next: ['p1'] },
      ]),
    /inconsistente/,
  )
})

console.log(`\n${passed} asserções ok.`)
