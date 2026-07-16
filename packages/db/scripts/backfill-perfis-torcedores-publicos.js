/**
 * Backfill: Torcedores aprovados devem ter perfil público.
 *
 * Ajusta (e cria, se faltar) `saas_perfis_membro` para torcedores aprovados
 * em cada tenant, setando `perfil_privado=false`.
 *
 * Uso (local):
 *   pnpm --filter @torcida/db db:generate
 *   pnpm --filter @torcida/db backfill:perfis-torcedores-publicos
 *
 * Uso (seguro):
 *   pnpm --filter @torcida/db backfill:perfis-torcedores-publicos -- --dry-run
 *   pnpm --filter @torcida/db backfill:perfis-torcedores-publicos -- --tenantId=<UUID>
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function readArgValue(argv, name) {
  const prefix = `--${name}=`
  const found = argv.find((a) => a.startsWith(prefix))
  return found ? found.slice(prefix.length) : null
}

function groupByTenant(rows) {
  const map = new Map()
  for (const r of rows) {
    if (!map.has(r.tenantId)) map.set(r.tenantId, [])
    map.get(r.tenantId).push({ userId: r.userId })
  }
  return map
}

async function main() {
  const argv = process.argv.slice(2)
  const dryRun = argv.includes('--dry-run')
  const tenantIdFilter = readArgValue(argv, 'tenantId')

  const where = {
    tipo: 'TORCEDOR',
    status: 'APROVADO',
    ...(tenantIdFilter ? { tenantId: tenantIdFilter } : {}),
  }

  const torcedores = await prisma.saasMembro.findMany({
    where,
    select: { tenantId: true, userId: true },
  })

  if (torcedores.length === 0) {
    console.log('Nenhum torcedor APROVADO encontrado.')
    return
  }

  const porTenant = groupByTenant(torcedores)
  let updated = 0
  let created = 0

  for (const [tenantId, rows] of porTenant.entries()) {
    const userIds = rows.map((r) => r.userId)

    const existentes = await prisma.perfilMembro.findMany({
      where: { tenantId, userId: { in: userIds } },
      select: { userId: true, perfilPrivado: true },
    })
    const existentesSet = new Set(existentes.map((e) => e.userId))
    const existentesPrivados = new Set(existentes.filter((e) => e.perfilPrivado).map((e) => e.userId))

    const missing = userIds.filter((id) => !existentesSet.has(id))
    const toUpdate = userIds.filter((id) => existentesPrivados.has(id))

    if (missing.length > 0) {
      if (dryRun) {
        created += missing.length
      } else {
        const res = await prisma.perfilMembro.createMany({
          data: missing.map((userId) => ({ userId, tenantId, perfilPrivado: false })),
          skipDuplicates: true,
        })
        created += res.count
      }
    }

    if (dryRun) {
      updated += toUpdate.length
    } else {
      const res = await prisma.perfilMembro.updateMany({
        where: { tenantId, userId: { in: userIds }, perfilPrivado: true },
        data: { perfilPrivado: false },
      })
      updated += res.count
    }
  }

  console.log(
    dryRun
      ? `Backfill (dry-run) concluído. Criados: ${created}. Atualizados: ${updated}.`
      : `Backfill concluído. Criados: ${created}. Atualizados: ${updated}.`,
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

