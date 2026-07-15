/**
 * Seed da lista canônica de departamentos de uma torcida.
 *
 *   pnpm --filter @torcida/db seed:departamentos
 *   TENANT_SLUG=pde-gavioes-fiel pnpm --filter @torcida/db seed:departamentos
 *
 * Sem TENANT_SLUG, semeia todos os tenants ativos. Idempotente.
 */
import { PrismaClient } from '@prisma/client'
import { upsertDepartamentosCanonicos } from '../src/departamentos-canonicos.js'

const db = new PrismaClient()

async function resolverTenants() {
  const slug = process.env.TENANT_SLUG
  if (slug) {
    const tenant = await db.tenant.findUnique({
      where: { slug },
      select: { id: true, nome: true, slug: true },
    })
    if (!tenant) throw new Error(`Tenant não encontrado para TENANT_SLUG="${slug}"`)
    return [tenant]
  }
  /** @type {Array<{ id: string, nome: string, slug: string }>} */
  const tenants = await db.tenant.findMany({
    where: { ativo: true },
    orderBy: { criadoEm: 'asc' },
    select: { id: true, nome: true, slug: true },
  })
  if (tenants.length === 0) throw new Error('Nenhum tenant ativo encontrado — informe TENANT_SLUG')
  return tenants
}

async function main() {
  const tenants = await resolverTenants()
  const verbose = tenants.length === 1
  console.log(
    verbose
      ? `Seed de departamentos para "${tenants[0].nome}" (${tenants[0].slug})\n`
      : `Seed de departamentos canônicos em ${tenants.length} tenant(s) ativos...\n`,
  )

  let i = 0
  let removedLegacy = 0
  for (const tenant of tenants) {
    const result = await upsertDepartamentosCanonicos(db, tenant.id)
    removedLegacy += result.removedLegacy
    i += 1
    if (verbose) {
      console.log(`  ✓ ${result.upserted} departamentos sincronizados`)
      if (result.removedLegacy > 0) {
        console.log(`  · removidos ${result.removedLegacy} legado(s) socio/torcedor`)
      }
    } else if (i % 50 === 0 || i === tenants.length) {
      console.log(`  … ${i}/${tenants.length}`)
    }
  }

  console.log(
    `\n10 departamentos × ${tenants.length} tenant(s) sincronizados` +
      (removedLegacy > 0 ? ` (${removedLegacy} legado(s) removidos)` : '') +
      '.',
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
