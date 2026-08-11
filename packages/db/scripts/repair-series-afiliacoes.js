/**
 * Atualiza `Afiliacao.serie` a partir do dataset offline do Brasileirão 2026.
 * Casa por nome+UF (`saoMesmoClube` / `chaveGrupoClube`). Não toca em outros campos.
 *
 *   pnpm --filter @torcida/db db:repair-series-afiliacoes
 *   pnpm --filter @torcida/db db:repair-series-afiliacoes -- --dry-run
 */
import { PrismaClient } from '@prisma/client'
import { SERIES_BRASILEIRAO_2026 } from '../src/data/series-brasileirao-2026.js'
import { chaveGrupoClube, saoMesmoClube } from '../src/data/afiliacoes-normalize.js'
import { prepareSeedEnv } from './lib/seed-env.js'

prepareSeedEnv({ scriptLabel: 'db:repair-series-afiliacoes' })

const DRY_RUN = process.argv.includes('--dry-run')
const db = new PrismaClient()

async function main() {
  console.log(
    `Repair séries Brasileirão 2026 — ${SERIES_BRASILEIRAO_2026.length} clubes no dataset` +
      (DRY_RUN ? ' (dry-run)' : ''),
  )

  /** @type {{ id: string, nome: string, estado: string | null, serie: string | null, slug: string | null }[]} */
  const afiliacoes = await db.afiliacao.findMany({
    select: { id: true, nome: true, estado: true, serie: true, slug: true },
  })

  /** @type {Map<string, typeof SERIES_BRASILEIRAO_2026[number]>} */
  const porChave = new Map()
  for (const c of SERIES_BRASILEIRAO_2026) {
    porChave.set(chaveGrupoClube(c.nome, c.estado), c)
  }

  let jaCorretos = 0
  let atualizados = 0
  let semMatch = 0
  /** @type {string[]} */
  const exemplosAtualizados = []
  /** @type {Set<string>} */
  const datasetCasado = new Set()

  for (const a of afiliacoes) {
    const chave = chaveGrupoClube(a.nome, a.estado)
    let alvo = porChave.get(chave) ?? null
    if (!alvo) {
      alvo =
        SERIES_BRASILEIRAO_2026.find((c) =>
          saoMesmoClube({ nome: a.nome, estado: a.estado }, c),
        ) ?? null
    }
    if (!alvo) {
      semMatch += 1
      continue
    }
    datasetCasado.add(chaveGrupoClube(alvo.nome, alvo.estado))
    if (a.serie === alvo.serie) {
      jaCorretos += 1
      continue
    }
    atualizados += 1
    if (exemplosAtualizados.length < 12) {
      exemplosAtualizados.push(
        `${a.slug ?? a.nome}: ${a.serie ?? 'null'} → ${alvo.serie}`,
      )
    }
    if (!DRY_RUN) {
      await db.afiliacao.update({
        where: { id: a.id },
        data: { serie: alvo.serie },
      })
    }
  }

  const datasetSemAfiliacao = SERIES_BRASILEIRAO_2026.length - datasetCasado.size

  console.log('\nResumo:')
  console.log(`  afiliações no banco     : ${afiliacoes.length}`)
  console.log(`  já corretas             : ${jaCorretos}`)
  console.log(`  atualizadas             : ${atualizados}${DRY_RUN ? ' (dry-run)' : ''}`)
  console.log(`  sem match no dataset    : ${semMatch}`)
  console.log(`  dataset sem afiliação   : ${datasetSemAfiliacao}`)
  if (exemplosAtualizados.length) {
    console.log('  exemplos:')
    for (const e of exemplosAtualizados) console.log(`    · ${e}`)
  }
}

main()
  .then(async () => {
    await db.$disconnect()
  })
  .catch(async (err) => {
    console.error(err)
    await db.$disconnect()
    process.exit(1)
  })
