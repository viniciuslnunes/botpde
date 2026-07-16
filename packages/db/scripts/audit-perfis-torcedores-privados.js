/**
 * Auditoria: torcedores com perfil ainda privado.
 *
 * Conta quantos torcedores têm `perfil_privado=true` e mostra uma amostra para
 * validar o antes/depois do backfill.
 *
 * Uso:
 *   pnpm --filter @torcida/db audit:perfis-torcedores-privados
 *   pnpm --filter @torcida/db audit:perfis-torcedores-privados -- --tenantId=<UUID>
 *   pnpm --filter @torcida/db audit:perfis-torcedores-privados -- --limit=20
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function readArgValue(argv, name) {
  const prefix = `--${name}=`
  const found = argv.find((a) => a.startsWith(prefix))
  return found ? found.slice(prefix.length) : null
}

function parseLimit(argv) {
  const raw = readArgValue(argv, 'limit')
  const parsed = raw ? Number.parseInt(raw, 10) : 10
  if (!Number.isFinite(parsed) || parsed <= 0) return 10
  return Math.min(parsed, 100)
}

async function main() {
  const argv = process.argv.slice(2)
  const tenantIdFilter = readArgValue(argv, 'tenantId')
  const limit = parseLimit(argv)

  const where = {
    tipo: 'TORCEDOR',
    ...(tenantIdFilter ? { tenantId: tenantIdFilter } : {}),
  }

  const rows = await prisma.saasMembro.findMany({
    where,
    select: {
      userId: true,
      nome: true,
      status: true,
      tenantId: true,
      tenant: { select: { slug: true, nome: true } },
      user: {
        select: {
          email: true,
          nome: true,
          perfisMembro: {
            where: { tenantId: tenantIdFilter ?? undefined },
            select: { tenantId: true, perfilPrivado: true, atualizadoEm: true },
          },
        },
      },
    },
  })

  const privados = rows
    .map((row) => {
      const perfil = row.user.perfisMembro.find((p) => p.tenantId === row.tenantId) ?? null
      return { row, perfil }
    })
    .filter(({ perfil }) => perfil?.perfilPrivado === true)

  const countsByTenant = new Map()
  for (const item of privados) {
    const key = item.row.tenantId
    const atual = countsByTenant.get(key) ?? {
      tenantId: item.row.tenantId,
      tenantSlug: item.row.tenant.slug,
      tenantNome: item.row.tenant.nome,
      total: 0,
    }
    atual.total += 1
    countsByTenant.set(key, atual)
  }

  const counts = [...countsByTenant.values()].sort((a, b) => b.total - a.total)

  console.log(`Torcedores com perfil privado: ${privados.length}`)
  if (counts.length > 0) {
    console.log('\nPor tenant:')
    for (const item of counts) {
      console.log(`- ${item.tenantNome} (${item.tenantSlug}): ${item.total}`)
    }
  }

  const sample = privados.slice(0, limit)
  if (sample.length > 0) {
    console.log(`\nAmostra (${sample.length}):`)
    for (const { row, perfil } of sample) {
      console.log(
        [
          `- tenant=${row.tenant.slug}`,
          `status=${row.status}`,
          `nome=${JSON.stringify(row.nome ?? row.user.nome ?? null)}`,
          `email=${JSON.stringify(row.user.email ?? null)}`,
          `atualizadoEm=${perfil?.atualizadoEm?.toISOString() ?? 'n/a'}`,
        ].join(' | '),
      )
    }
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

