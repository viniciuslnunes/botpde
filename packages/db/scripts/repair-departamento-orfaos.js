/**
 * Remove perfis e projeções departamentais de usuários inelegíveis: sem
 * SaasMembro no tenant, TORCEDOR, não APROVADO, desligado ou espelhado.
 * Também normaliza preferências de TORCEDOR e preferências cross-tenant.
 * Roles sem departamento são preservadas.
 *
 * Uso:
 *   pnpm --filter @torcida/db db:repair-departamento-orfaos
 *   pnpm --filter @torcida/db db:repair-departamento-orfaos -- --dry-run
 *   TENANT_SLUG=pde-gavioes-fiel pnpm --filter @torcida/db db:repair-departamento-orfaos
 */
import { PrismaClient } from '@prisma/client'
import { isMembroElegivelDepartamento } from '../../types/src/departamento-eligibilidade.js'

const db = new PrismaClient()
const dryRun = process.argv.includes('--dry-run')
const BATCH_SIZE = 500

function batches(values) {
  const result = []
  for (let i = 0; i < values.length; i += BATCH_SIZE) {
    result.push(values.slice(i, i + BATCH_SIZE))
  }
  return result
}

async function analisarTenant(client, tenant) {
  const rolesDeArea = await client.role.findMany({
    where: { tenantId: tenant.id, departamentoId: { not: null } },
    select: { id: true },
  })
  const roleIds = rolesDeArea.map((r) => r.id)

  const userRoles = roleIds.length === 0
    ? []
    : await client.userRole.findMany({
        where: { tenantId: tenant.id, roleId: { in: roleIds } },
        select: { userId: true },
      })
  const memberships = await client.userDepartamento.findMany({
    where: { tenantId: tenant.id },
    select: { userId: true },
  })
  const gestores = await client.departamentoGestor.findMany({
    where: { departamento: { tenantId: tenant.id } },
    select: { userId: true },
  })

  const candidateIds = [...new Set([
    ...userRoles.map((row) => row.userId),
    ...memberships.map((row) => row.userId),
    ...gestores.map((row) => row.userId),
  ])]
  const membros = candidateIds.length === 0
    ? []
    : await client.saasMembro.findMany({
        where: { tenantId: tenant.id, userId: { in: candidateIds } },
        select: {
          userId: true,
          tenantId: true,
          tipo: true,
          status: true,
          desligadoEm: true,
          espelhado: true,
          membroOrigemId: true,
        },
      })
  const membroPorUser = new Map(membros.map((m) => [m.userId, m]))
  const inelegiveis = new Set(
    candidateIds.filter(
      (userId) => !isMembroElegivelDepartamento(membroPorUser.get(userId), tenant.id),
    ),
  )

  const roleUserIds = [...new Set(userRoles.map((row) => row.userId).filter((id) => inelegiveis.has(id)))]
  const membershipUserIds = [
    ...new Set(memberships.map((row) => row.userId).filter((id) => inelegiveis.has(id))),
  ]
  const gestorUserIds = [...new Set(gestores.map((row) => row.userId).filter((id) => inelegiveis.has(id)))]

  const preferencias = await client.saasMembro.findMany({
    where: { tenantId: tenant.id, departamentoId: { not: null } },
    select: {
      id: true,
      tipo: true,
      departamento: { select: { tenantId: true } },
    },
  })
  const preferenciasTorcedor = preferencias
    .filter((m) => m.tipo === 'TORCEDOR')
    .map((m) => m.id)
  const preferenciasCrossTenant = preferencias
    .filter((m) => m.departamento?.tenantId !== tenant.id)
    .map((m) => m.id)
  const preferenciasNormalizar = [
    ...new Set([...preferenciasTorcedor, ...preferenciasCrossTenant]),
  ]

  const motivos = {
    semMembro: candidateIds.filter((id) => !membroPorUser.has(id)).length,
    torcedor: candidateIds.filter((id) => membroPorUser.get(id)?.tipo === 'TORCEDOR').length,
    naoAprovado: candidateIds.filter((id) => {
      const membro = membroPorUser.get(id)
      return membro && membro.status !== 'APROVADO'
    }).length,
    desligado: candidateIds.filter((id) => membroPorUser.get(id)?.desligadoEm != null).length,
    espelhado: candidateIds.filter((id) => membroPorUser.get(id)?.espelhado === true).length,
    membroOrigem: candidateIds.filter((id) => Boolean(membroPorUser.get(id)?.membroOrigemId)).length,
  }

  return {
    roleIds,
    roleUserIds,
    membershipUserIds,
    gestorUserIds,
    preferenciasTorcedor,
    preferenciasCrossTenant,
    preferenciasNormalizar,
    inelegiveis: inelegiveis.size,
    motivos,
  }
}

async function aplicarTenant(tx, tenant) {
  const analise = await analisarTenant(tx, tenant)
  let roles = 0
  let memberships = 0
  let gestores = 0
  let preferencias = 0

  for (const userIds of batches(analise.roleUserIds)) {
    const result = await tx.userRole.deleteMany({
      where: {
        tenantId: tenant.id,
        userId: { in: userIds },
        roleId: { in: analise.roleIds },
      },
    })
    roles += result.count
  }
  for (const userIds of batches(analise.membershipUserIds)) {
    const result = await tx.userDepartamento.deleteMany({
      where: { tenantId: tenant.id, userId: { in: userIds } },
    })
    memberships += result.count
  }
  for (const userIds of batches(analise.gestorUserIds)) {
    const result = await tx.departamentoGestor.deleteMany({
      where: { userId: { in: userIds }, departamento: { tenantId: tenant.id } },
    })
    gestores += result.count
  }
  for (const ids of batches(analise.preferenciasNormalizar)) {
    const result = await tx.saasMembro.updateMany({
      where: { tenantId: tenant.id, id: { in: ids } },
      data: { departamentoId: null },
    })
    preferencias += result.count
  }

  return { analise, roles, memberships, gestores, preferencias }
}

async function main() {
  console.log(
    dryRun
      ? 'Dry-run — nenhuma alteração será gravada.\n'
      : 'Removendo perfis/projeções de área inelegíveis e normalizando preferências...\n',
  )

  const slugFilter = process.env.TENANT_SLUG?.trim()
  const tenants = await db.tenant.findMany({
    where: slugFilter ? { slug: slugFilter } : undefined,
    select: { id: true, slug: true },
  })
  if (tenants.length === 0) {
    throw new Error(slugFilter ? `Tenant "${slugFilter}" não encontrado` : 'Nenhum tenant')
  }

  let totalUd = 0
  let totalGestores = 0
  let totalRoles = 0
  let totalPreferenciasTorcedor = 0
  let totalPreferenciasCrossTenant = 0
  let totalPreferenciasNormalizadas = 0

  for (const tenant of tenants) {
    if (dryRun) {
      const analise = await analisarTenant(db, tenant)
      const ud = analise.membershipUserIds.length
        ? await db.userDepartamento.count({
            where: { tenantId: tenant.id, userId: { in: analise.membershipUserIds } },
          })
        : 0
      const gest = analise.gestorUserIds.length
        ? await db.departamentoGestor.count({
            where: {
              userId: { in: analise.gestorUserIds },
              departamento: { tenantId: tenant.id },
            },
          })
        : 0
      const ur = analise.roleUserIds.length && analise.roleIds.length
        ? await db.userRole.count({
            where: {
              tenantId: tenant.id,
              userId: { in: analise.roleUserIds },
              roleId: { in: analise.roleIds },
            },
          })
        : 0
      console.log(
        `  [dry] ${tenant.slug} — inelegíveis=${analise.inelegiveis}, UD=${ud}, gestores=${gest}, roles área=${ur}, prefs TORCEDOR=${analise.preferenciasTorcedor.length}, prefs cross-tenant=${analise.preferenciasCrossTenant.length}, prefs únicas=${analise.preferenciasNormalizar.length}`,
      )
      console.log(
        `        motivos: sem membro=${analise.motivos.semMembro}, TORCEDOR=${analise.motivos.torcedor}, não aprovado=${analise.motivos.naoAprovado}, desligado=${analise.motivos.desligado}, espelhado=${analise.motivos.espelhado}, membroOrigemId=${analise.motivos.membroOrigem}`,
      )
      totalUd += ud
      totalGestores += gest
      totalRoles += ur
      totalPreferenciasTorcedor += analise.preferenciasTorcedor.length
      totalPreferenciasCrossTenant += analise.preferenciasCrossTenant.length
      totalPreferenciasNormalizadas += analise.preferenciasNormalizar.length
      continue
    }

    const result = await db.$transaction(
      (tx) => aplicarTenant(tx, tenant),
      { timeout: 30_000, maxWait: 10_000 },
    )
    totalUd += result.memberships
    totalGestores += result.gestores
    totalRoles += result.roles
    totalPreferenciasTorcedor += result.analise.preferenciasTorcedor.length
    totalPreferenciasCrossTenant += result.analise.preferenciasCrossTenant.length
    totalPreferenciasNormalizadas += result.preferencias
    console.log(
      `  ✓ ${tenant.slug} — inelegíveis=${result.analise.inelegiveis}, UD=${result.memberships}, gestores=${result.gestores}, roles área=${result.roles}, prefs normalizadas=${result.preferencias}`,
    )
  }

  console.log(
    `\n${dryRun ? 'Resumo (dry-run)' : 'Resumo'}: UD=${totalUd}, gestores=${totalGestores}, roles área=${totalRoles}, prefs TORCEDOR=${totalPreferenciasTorcedor}, prefs cross-tenant=${totalPreferenciasCrossTenant}, prefs únicas/normalizadas=${totalPreferenciasNormalizadas}`,
  )
  if (dryRun) console.log('Rode sem --dry-run para aplicar.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
