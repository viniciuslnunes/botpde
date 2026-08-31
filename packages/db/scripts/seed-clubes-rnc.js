/**
 * Alinha `Afiliacao` ao Ranking Nacional de Clubes (RNC) da CBF.
 *
 *   TORCIDA_ENV=local pnpm --filter @torcida/db seed:clubes-rnc
 *   TORCIDA_ENV=local pnpm --filter @torcida/db seed:clubes-rnc -- --dry-run
 *
 * Faz duas coisas:
 *  1. grava `rncPosicao` / `rncPontos` / `rncEdicao` em quem já existe — é a
 *     prova de atividade profissional recente e o critério de relevância do
 *     catálogo (ordenar onboarding e busca por algo oficial, não por nome);
 *  2. CRIA o clube que está no ranking e falta no catálogo, usando a ficha já
 *     cruzada em `clubes-ausentes-rnc-2026.json` (cidade, fundação, estádio,
 *     site, QID do Wikidata, id do Ogol).
 *
 * O que ele NÃO faz: apagar ou arquivar clube fora do RNC. Clube histórico sem
 * atividade profissional (Tupi, São Caetano, Metropolitano) segue no catálogo —
 * a torcida dele existe. Ausência no RNC vira dado, não exclusão.
 *
 * Depois deste seed, rode `db:repair-series-afiliacoes` para preencher a série
 * dos clubes recém-criados.
 */
import { PrismaClient } from '@prisma/client'
import { gerarSlugUnico } from '../src/data/afiliacoes-normalize.js'
import { prepareSeedEnv } from './lib/seed-env.js'
import {
  indexarClubes,
  chaveIndice,
  lerDataset,
  melhorCandidato,
  agruparPorUf,
} from './lib/catalogo-clubes.js'

prepareSeedEnv({ scriptLabel: 'seed:clubes-rnc' })

const DRY_RUN = process.argv.includes('--dry-run')
const db = new PrismaClient()

async function main() {
  const ranking = lerDataset('cbf-ranking-clubes-2026.json')
  const ausentes = lerDataset('clubes-ausentes-rnc-2026.json')
  const edicao = String(ranking.edicao ?? '2026')

  /** @type {{id: string, nome: string, estado: string | null, slug: string | null, rncPosicao: number | null, rncPontos: number | null}[]} */
  const afiliacoes = await db.afiliacao.findMany({
    select: { id: true, nome: true, estado: true, slug: true, rncPosicao: true, rncPontos: true },
  })
  const { indice, colisoes } = indexarClubes(afiliacoes)
  const porUf = agruparPorUf(afiliacoes)
  const slugsUsados = new Set(afiliacoes.map((a) => a.slug).filter(Boolean))

  /** Ficha extra por chave, para os clubes que serão criados. */
  const fichaPorChave = new Map(
    (ausentes.clubes ?? []).map((c) => [chaveIndice(c.nome, c.uf), c]),
  )

  let atualizados = 0
  let criados = 0
  let inalterados = 0
  const pulados = []

  for (const item of ranking.clubes ?? []) {
    const chave = chaveIndice(item.clube, item.uf)

    if (colisoes.has(chave)) {
      pulados.push(
        `${item.clube}/${item.uf} → homônimos no catálogo: ` +
          colisoes.get(chave).map((c) => c.nome).join(' | '),
      )
      continue
    }

    let existente = indice.get(chave)

    if (!existente) {
      // Chave canônica não bateu: tenta similaridade dentro da UF antes de
      // criar. Sem isso, "Marília" viraria duplicata de "Marilia Atlético
      // Clube" — e duplicata de clube contamina tenant, partida e rivalidade.
      const { clube, score } = melhorCandidato(item.clube, porUf.get(item.uf) ?? [])
      if (clube && score >= 0.8) {
        existente = clube
      } else if (clube && score >= 0.45) {
        pulados.push(
          `${item.clube}/${item.uf} → parecido com "${clube.nome}" (score ${score.toFixed(2)}) — confirmar antes de criar`,
        )
        continue
      }
    }

    if (existente) {
      if (existente.rncPosicao === item.pos && existente.rncPontos === item.pontos) {
        inalterados += 1
        continue
      }
      if (!DRY_RUN) {
        await db.afiliacao.update({
          where: { id: existente.id },
          data: { rncPosicao: item.pos, rncPontos: item.pontos, rncEdicao: edicao },
        })
      }
      atualizados += 1
      continue
    }

    const ficha = fichaPorChave.get(chave) ?? {}
    const slug = gerarSlugUnico(item.clube, item.uf, slugsUsados)
    const dados = {
      nome: item.clube,
      slug,
      estado: item.uf,
      cidade: ficha.cidade ?? null,
      fundacaoAno: anoDe(ficha.fundacao),
      estadio: ficha.estadio ?? null,
      estadioCapacidade: ficha.capacidade ?? null,
      siteOficial: ficha.site ?? null,
      wikidataQid: ficha.qid ?? null,
      ogolId: ficha.ogolId ?? null,
      rncPosicao: item.pos,
      rncPontos: item.pontos,
      rncEdicao: edicao,
    }
    if (!DRY_RUN) await db.afiliacao.create({ data: dados })
    criados += 1
    console.log(
      `  + ${item.clube} (${item.uf}) — ${item.pos}º, ${item.pontos} pts` +
        `${ficha.cidade ? ` · ${ficha.cidade}` : ' · SEM CIDADE'}`,
    )
  }

  console.log(
    `\nRNC ${edicao} — ${criados} clubes criados, ${atualizados} atualizados, ${inalterados} já alinhados.`,
  )
  if (pulados.length > 0) {
    console.log(`\n⚠ ${pulados.length} entradas puladas por homônimo (resolver à mão):`)
    for (const p of pulados) console.log(`   ${p}`)
  }
  if (DRY_RUN) console.log('\n(dry-run — nada gravado)')
  else if (criados > 0) console.log('Próximo passo: db:repair-series-afiliacoes (preenche a série dos novos).')
}

/**
 * `"1914-01-01"` ou `"2019"` → 1914 / 2019. Só o ano é confiável nas fontes.
 * @param {string | null | undefined} valor
 * @returns {number | null}
 */
function anoDe(valor) {
  const m = /(\d{4})/.exec(String(valor ?? ''))
  if (!m) return null
  const ano = Number(m[1])
  return ano >= 1850 && ano <= new Date().getFullYear() ? ano : null
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
