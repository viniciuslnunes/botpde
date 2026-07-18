/**
 * Remove UserDepartamento / DepartamentoGestor de quem está PENDENTE ou
 * REPROVADO no tenant (órfãos do bug que associava área no onboarding).
 *
 * Uso:
 *   pnpm --filter @torcida/db db:repair-departamento-orfaos
 *   pnpm --filter @torcida/db db:repair-departamento-orfaos -- --dry-run
 *   TENANT_SLUG=pde-gavioes-fiel pnpm --filter @torcida/db db:repair-departamento-orfaos
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const dryRun = process.argv.includes('--dry-run')

async function main() {
  console.log(
    dryRun
      ? 'Dry-run — nenhuma alteração será gravada.\n'
      : 'Removendo membership de área de pendentes/reprovados...\n',
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

  for (const tenant of tenants) {
    const orfaos = await db.saasMembro.findMany({
      where: {
        tenantId: tenant.id,
        status: { in: ['PENDENTE', 'REPROVADO'] },
      },
      select: { userId: true },
    })
    const userIds = [...new Set(orfaos.map((m) => m.userId))]
    if (userIds.length === 0) {
      console.log(`  · ${tenant.slug} — nenhum órfão`)
      continue
    }

    const rolesDeArea = await db.role.findMany({
      where: { tenantId: tenant.id, departamentoId: { not: null } },
      select: { id: true },
    })
    const roleIds = rolesDeArea.map((r) => r.id)

    if (dryRun) {
      const [ud, gest, ur] = await Promise.all([
        db.userDepartamento.count({
          where: { tenantId: tenant.id, userId: { in: userIds } },
        }),
        db.departamentoGestor.count({
          where: { userId: { in: userIds }, departamento: { tenantId: tenant.id } },
        }),
        roleIds.length === 0
          ? Promise.resolve(0)
          : db.userRole.count({
              where: {
                tenantId: tenant.id,
                userId: { in: userIds },
                roleId: { in: roleIds },
              },
            }),
      ])
      console.log(
        `  [dry] ${tenant.slug} — ${userIds.length} user(s), UD=${ud}, gestores=${gest}, roles área=${ur}`,
      )
      totalUd += ud
      totalGestores += gest
      totalRoles += ur
      continue
    }

    const [udRes, gestRes, urRes] = await Promise.all([
      db.userDepartamento.deleteMany({
        where: { tenantId: tenant.id, userId: { in: userIds } },
      }),
      db.departamentoGestor.deleteMany({
        where: { userId: { in: userIds }, departamento: { tenantId: tenant.id } },
      }),
      roleIds.length === 0
        ? Promise.resolve({ count: 0 })
        : db.userRole.deleteMany({
            where: {
              tenantId: tenant.id,
              userId: { in: userIds },
              roleId: { in: roleIds },
            },
          }),
    ])

    totalUd += udRes.count
    totalGestores += gestRes.count
    totalRoles += urRes.count
    console.log(
      `  ✓ ${tenant.slug} — ${userIds.length} user(s), UD=${udRes.count}, gestores=${gestRes.count}, roles área=${urRes.count}`,
    )
  }

  console.log(
    `\n${dryRun ? 'Resumo (dry-run)' : 'Resumo'}: UD=${totalUd}, gestores=${totalGestores}, roles área=${totalRoles}`,
  )
  if (dryRun) console.log('Rode sem --dry-run para aplicar.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
