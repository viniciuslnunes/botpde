/**
 * Preenche Afiliacao.torcedoresEstimados para TODOS os clubes.
 *
 *   pnpm --filter @torcida/db seed:torcedores-estimados
 *   pnpm --filter @torcida/db seed:torcedores-estimados -- --dry-run
 */
import { PrismaClient } from '@prisma/client'
import { chaveGrupoClube } from '../src/data/afiliacoes-normalize.js'
import { resolverTorcedoresEstimados } from '../src/data/torcedores-estimados.js'
import { prepareSeedEnv } from './lib/seed-env.js'

prepareSeedEnv({ scriptLabel: 'seed:torcedores-estimados' })

const DRY_RUN = process.argv.includes('--dry-run')
const db = new PrismaClient()

async function main() {
  const afiliacoes = await db.afiliacao.findMany({
    select: {
      id: true,
      nome: true,
      estado: true,
      torcedoresEstimados: true,
      torcedoresEstimadosTipo: true,
    },
    orderBy: { nome: 'asc' },
  })

  let atualizados = 0
  let ibope = 0
  let limite = 0

  for (const af of afiliacoes) {
    const chave = chaveGrupoClube(af.nome, af.estado)
    const dados = resolverTorcedoresEstimados(chave)

    if (
      af.torcedoresEstimados === dados.valor &&
      af.torcedoresEstimadosTipo === dados.tipo
    ) {
      continue
    }

    if (!DRY_RUN) {
      await db.afiliacao.update({
        where: { id: af.id },
        data: {
          torcedoresEstimados: dados.valor,
          torcedoresEstimadosFonte: dados.fonte,
          torcedoresEstimadosTipo: dados.tipo,
        },
      })
    }

    atualizados += 1
    if (dados.tipo === 'IBOPE_DIGITAL') ibope += 1
    else limite += 1

    const rotulo =
      dados.tipo === 'LIMITE_ATE'
        ? 'não estimado'
        : dados.valor.toLocaleString('pt-BR')
    console.log(`  ✓ ${af.nome} (${af.estado ?? '?'}) → ${rotulo} [${dados.tipo}]`)
  }

  console.log(
    `\nTorcedores estimados — ${atualizados} atualizados (${ibope} IBOPE, ${limite} limite dinâmico)`,
  )
  if (DRY_RUN) console.log('(dry-run — nada gravado)')
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
