/**
 * Repara cargos de sistema + perfis Membro/Gestor por departamento.
 *
 * Uso:
 *   node scripts/repair-system-role-permissions.js
 *   node scripts/repair-system-role-permissions.js --dry-run
 */
import { PrismaClient } from '@prisma/client'
import { podeTerVice } from '../../types/src/permissions.js'
import {
  bootstrapAcessoTenant,
  syncMembershipFromRoles,
} from '../src/departamentos-canonicos.js'

const db = new PrismaClient()
const dryRun = process.argv.includes('--dry-run')

async function main() {
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
