/**
 * Repara cargos de sistema + perfis Membro/Gestor por departamento.
 *
 * Uso:
 *   node scripts/repair-system-role-permissions.js
 *   node scripts/repair-system-role-permissions.js --dry-run
 *   node scripts/repair-system-role-permissions.js --permissions-only
 *   node scripts/repair-system-role-permissions.js --permissions-only --dry-run
 *
 * `--permissions-only` — modo rápido quando só os arrays persistidos em
 * Role (isSystem) estão defasados vs `SYSTEM_ROLE_PERMISSIONS`. Atualiza em
 * lote o campo canônico (owner/admin/vice → permissionsExtras; member →
 * permissions), preserva o outro campo e todos os UserRole/memberships.
 * A escrita é um `updateMany` por cargo (≤ 4 statements) numa transação —
 * update row a row estourava a transação interativa (P2028).
 * Não faz bootstrap, não cria roles faltantes, não sincroniza departamentos
 * nem memberships. Respeita TENANT_SLUG e --dry-run.
 *
 * Default (sem a flag) — bootstrap completo + syncMembership por usuário
 * (mais lento; use quando faltar role, departamento ou membership).
 */
import { PrismaClient } from '@prisma/client'
import {
  podeTerVice,
  SYSTEM_ROLE_PERMISSIONS,
} from '../../types/src/permissions.js'
import {
  bootstrapAcessoTenant,
  syncMembershipFromRoles,
} from '../src/departamentos-canonicos.js'
import {
  SYSTEM_ROLE_NOMES,
  buildPermissionsOnlyPlan,
  agruparUpdatesPorCargo,
} from '../src/repair-system-role-permissions-plan.js'

const db = new PrismaClient()
const dryRun = process.argv.includes('--dry-run')
const permissionsOnly = process.argv.includes('--permissions-only')

async function main() {
  if (permissionsOnly) {
    await runPermissionsOnly()
    return
  }
  await runBootstrapCompleto()
}

/**
 * Atualiza só o array canônico dos Roles de sistema existentes.
 */
async function runPermissionsOnly() {
  console.log(
    dryRun
      ? 'Dry-run (--permissions-only) — nenhuma alteração será gravada.\n'
      : 'Reparando arrays de permissão dos cargos de sistema (--permissions-only)...\n',
  )

  const slugFilter = process.env.TENANT_SLUG?.trim()
  /** @type {{ id: string }[] | undefined} */
  let tenantFilter
  if (slugFilter) {
    const tenants = await db.tenant.findMany({
      where: { slug: slugFilter },
      select: { id: true },
    })
    if (tenants.length === 0) {
      throw new Error(`Tenant "${slugFilter}" não encontrado`)
    }
    tenantFilter = tenants
    console.log(`Filtro TENANT_SLUG=${slugFilter} (${tenants.length} tenant).\n`)
  }

  /** @type {{ id: string, nome: string, permissions: string[], permissionsExtras: string[] }[]} */
  const roles = await db.role.findMany({
    where: {
      isSystem: true,
      nome: { in: [...SYSTEM_ROLE_NOMES] },
      ...(tenantFilter ? { tenantId: { in: tenantFilter.map((t) => t.id) } } : {}),
    },
    select: {
      id: true,
      nome: true,
      permissions: true,
      permissionsExtras: true,
    },
  })

  const { updates, porCargo } = buildPermissionsOnlyPlan(roles, SYSTEM_ROLE_PERMISSIONS)

  console.log('Por cargo (encontrados / desatualizados):')
  for (const nome of SYSTEM_ROLE_NOMES) {
    const c = porCargo[nome]
    console.log(`  ${nome}: ${c.encontrados} encontrados, ${c.desatualizados} desatualizados`)
  }
  console.log(`\nTotal a atualizar: ${updates.length}`)

  if (dryRun) {
    console.log('\nResumo (dry-run): nenhuma row gravada.')
    console.log('Rode sem --dry-run para aplicar (--permissions-only).')
    return
  }

  if (updates.length === 0) {
    console.log('\nNada a fazer — cargos de sistema já em dia.')
    return
  }

  // Um `updateMany` por cargo (≤ 4 statements). Milhares de `update()`
  // individuais estouravam a transação interativa com P2028.
  const lotes = agruparUpdatesPorCargo(updates)

  /** @type {Record<string, number>} */
  const atualizados = Object.fromEntries(SYSTEM_ROLE_NOMES.map((n) => [n, 0]))

  await db.$transaction(
    async (tx) => {
      for (const lote of lotes) {
        const result = await tx.role.updateMany({
          where: { id: { in: lote.ids }, isSystem: true, nome: lote.nome },
          data:
            lote.field === 'permissions'
              ? { permissions: lote.next }
              : { permissionsExtras: lote.next },
        })
        atualizados[lote.nome] = result.count
      }
    },
    { maxWait: 15_000, timeout: 120_000 },
  )

  console.log(`\n${lotes.length} updateMany aplicado(s) em uma transação.`)
  console.log('Por cargo (atualizados):')
  for (const nome of SYSTEM_ROLE_NOMES) {
    console.log(`  ${nome}: ${atualizados[nome]} atualizados`)
  }
  const total = Object.values(atualizados).reduce((a, b) => a + b, 0)
  console.log(`\nResumo: ${total} Role(s) atualizado(s) de ${updates.length} planejado(s).`)
}

/**
 * Modo default: bootstrap completo + sync de memberships.
 */
async function runBootstrapCompleto() {
  console.log(
    dryRun
      ? 'Dry-run — nenhuma alteração será gravada.\n'
      : 'Reparando cargos de sistema e perfis de departamento...\n',
  )

  const slugFilter = process.env.TENANT_SLUG?.trim()
  const tenants = await db.tenant.findMany({
    where: slugFilter ? { slug: slugFilter } : undefined,
    select: { id: true, slug: true, nome: true },
  })
  if (tenants.length === 0) {
    throw new Error(slugFilter ? `Tenant "${slugFilter}" não encontrado` : 'Nenhum tenant')
  }
  console.log(`Encontrados ${tenants.length} tenant(s).\n`)

  let ok = 0
  for (const tenant of tenants) {
    const sede = await db.sede.findFirst({
      where: { tenantId: tenant.id, tipo: 'SEDE' },
      select: { tipo: true },
    })
    const incluirVice = podeTerVice(sede?.tipo ?? 'PONTO_ENCONTRO')

    if (dryRun) {
      console.log(`  [dry] ${tenant.slug} — vice=${incluirVice}`)
      ok += 1
      continue
    }

    const result = await bootstrapAcessoTenant(db, tenant.id, { incluirVice })
    console.log(
      `  ✓ ${tenant.slug} — deptos ${result.upserted}, perfis área ${result.perfisArea}, sistema ${result.systemUpserted}`,
    )

    // Sincroniza memberships existentes a partir dos roles já atribuídos
    const userIds = await db.userRole.findMany({
      where: { tenantId: tenant.id },
      select: { userId: true },
      distinct: ['userId'],
    })
    for (const { userId } of userIds) {
      await syncMembershipFromRoles(db, { userId, tenantId: tenant.id })
    }

    // Migra UserDepartamento legado → atribui perfil Membro/Gestor se faltar
    await migrarMembershipLegado(db, tenant.id)
    ok += 1
  }

  console.log(`\n${dryRun ? 'Resumo (dry-run)' : 'Resumo'}: ${ok} tenant(s)`)
  if (dryRun) console.log('Rode sem --dry-run para aplicar.')
}

/**
 * Quem está em UserDepartamento sem Role vinculado à área recebe
 * Membro · X ou Gestor · X automaticamente.
 *
 * @param {import('@prisma/client').PrismaClient} client
 * @param {string} tenantId
 */
async function migrarMembershipLegado(client, tenantId) {
  const roles = await client.role.findMany({
    where: { tenantId, departamentoId: { not: null } },
    select: {
      id: true,
      departamentoId: true,
      papelNoDepartamento: true,
      nome: true,
    },
  })
  const roleByKey = new Map(
    roles.map((r) => [`${r.departamentoId}:${r.papelNoDepartamento}`, r]),
  )

  const membros = await client.userDepartamento.findMany({
    where: { tenantId },
    select: { userId: true, departamentoId: true },
  })
  const gestores = await client.departamentoGestor.findMany({
    where: { departamento: { tenantId } },
    select: { userId: true, departamentoId: true },
  })
  const gestorKey = new Set(gestores.map((g) => `${g.userId}:${g.departamentoId}`))

  const userRoles = await client.userRole.findMany({
    where: { tenantId },
    include: { role: { select: { departamentoId: true } } },
  })
  const covered = new Set(
    userRoles
      .filter((ur) => ur.role.departamentoId)
      .map((ur) => `${ur.userId}:${ur.role.departamentoId}`),
  )

  for (const m of membros) {
    const key = `${m.userId}:${m.departamentoId}`
    if (covered.has(key)) continue
    const isGestor = gestorKey.has(key)
    const papel = isGestor ? 'GESTOR' : 'MEMBRO'
    const role = roleByKey.get(`${m.departamentoId}:${papel}`)
    if (!role) continue
    await client.userRole.create({
      data: { userId: m.userId, tenantId, roleId: role.id },
    })
    covered.add(key)
  }
}

main()
  .catch((err) => {
    console.error('Erro ao reparar cargos:', err)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
