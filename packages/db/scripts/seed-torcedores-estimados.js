/**
 * Preenche Afiliacao.torcedoresEstimados a partir de dados curados offline.
 *
 *   pnpm --filter @torcida/db seed:torcedores-estimados
 *   pnpm --filter @torcida/db seed:torcedores-estimados -- --dry-run
 */
import { PrismaClient } from '@prisma/client'
import { chaveGrupoClube } from '../src/data/afiliacoes-normalize.js'
import { indiceTorcedoresEstimados } from '../src/data/torcedores-estimados.js'

const DRY_RUN = process.argv.includes('--dry-run')
const db = new PrismaClient()

async function main() {
  const indice = indiceTorcedoresEstimados()
  const afiliacoes = await db.afiliacao.findMany({
    select: { id: true, nome: true, estado: true, torcedoresEstimados: true },
    orderBy: { nome: 'asc' },
  })

  let atualizados = 0
  let ignorados = 0

  for (const af of afiliacoes) {
    const chave = chaveGrupoClube(af.nome, af.estado)
    const dados = indice.get(chave)
    if (!dados) {
      ignorados += 1
      continue
    }
    if (af.torcedoresEstimados === dados.valor) {
      ignorados += 1
      continue
    }

    if (!DRY_RUN) {
      await db.afiliacao.update({
        where: { id: af.id },
        data: {
          torcedoresEstimados: dados.valor,
          torcedoresEstimadosFonte: dados.fonte,
        },
      })
    }
    atualizados += 1
    console.log(`  ✓ ${af.nome} (${af.estado ?? '?'}) → ${dados.valor.toLocaleString('pt-BR')}`)
  }

  console.log(`\nTorcedores estimados — ${atualizados} atualizados, ${ignorados} sem mudança/ausentes`)
  if (DRY_RUN) console.log('(dry-run — nada gravado)')
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
