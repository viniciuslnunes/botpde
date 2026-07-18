/**
 * Repair: sócios aprovados devem ter perfil privado por default.
 *
 * Corrige linhas em que `perfil_privado=false` ficou gravado sem o sócio ter
 * escolhido tornar o perfil público (ex.: default do schema / create sem flag /
 * override antigo na UI).
 *
 * Uso (local):
 *   pnpm --filter @torcida/db repair:perfis-socios-privados
 *
 * Uso (seguro):
 *   pnpm --filter @torcida/db repair:perfis-socios-privados -- --dry-run
 *   pnpm --filter @torcida/db repair:perfis-socios-privados -- --tenantId=<UUID>
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function readArgValue(argv, name) {
  const prefix = `--${name}=`
  const found = argv.find((a) => a.startsWith(prefix))
  return found ? found.slice(prefix.length) : null
}

async function main() {
  const argv = process.argv.slice(2)
  const dryRun = argv.includes('--dry-run')
  const tenantId = readArgValue(argv, 'tenantId')

  const membros = await prisma.saasMembro.findMany({
    where: {
      tipo: 'SOCIO',
      status: 'APROVADO',
      ...(tenantId ? { tenantId } : {}),
    },
    select: { userId: true, tenantId: true },
  })

  console.log(`Sócios aprovados encontrados: ${membros.length}`)

  let atualizados = 0
  let criados = 0
  let jaPrivados = 0

  for (const { userId, tenantId: tid } of membros) {
    const perfil = await prisma.perfilMembro.findUnique({
      where: { userId_tenantId: { userId, tenantId: tid } },
      select: { perfilPrivado: true },
    })

    if (!perfil) {
      if (dryRun) {
        console.log(`[dry-run] criaria perfil privado user=${userId} tenant=${tid}`)
      } else {
        await prisma.perfilMembro.create({
          data: { userId, tenantId: tid, perfilPrivado: true },
        })
      }
      criados += 1
      continue
    }

    if (perfil.perfilPrivado) {
      jaPrivados += 1
      continue
    }

    if (dryRun) {
      console.log(`[dry-run] privatizaria user=${userId} tenant=${tid}`)
    } else {
      await prisma.perfilMembro.update({
        where: { userId_tenantId: { userId, tenantId: tid } },
        data: { perfilPrivado: true },
      })
    }
    atualizados += 1
  }

  console.log(
    dryRun
      ? `[dry-run] criaria=${criados} privatizaria=${atualizados} jaPrivados=${jaPrivados}`
      : `criados=${criados} atualizados=${atualizados} jaPrivados=${jaPrivados}`,
  )
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
