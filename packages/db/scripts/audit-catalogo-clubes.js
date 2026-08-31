/**
 * Auditoria do catálogo de clubes e torcidas contra as fontes externas
 * versionadas em `packages/db/src/data`.
 *
 *   TORCIDA_ENV=local pnpm --filter @torcida/db audit:catalogo-clubes
 *   TORCIDA_ENV=local pnpm --filter @torcida/db audit:catalogo-clubes -- --json
 *
 * Imprime o mesmo placar de `docs/data/auditoria-catalogo-clubes.md`, medindo:
 *  1. cobertura do Ranking Nacional de Clubes (CBF);
 *  2. ficha do clube (fundação, estádio, cores, site, ids externos);
 *  3. validade da cidade contra a malha municipal do IBGE;
 *  4. rivalidades gravadas x dataset curado (e rivalidade interestadual, que
 *     não deveria existir);
 *  5. torcidas paulistas x registro da Federação Paulista;
 *  6. homônimos que a chave nome+UF não separa.
 *
 * Só leitura — nunca escreve. Sai com código 1 se achar problema estrutural
 * (rivalidade interestadual gravada ou homônimo novo), para poder virar gate.
 */
import { PrismaClient } from '@prisma/client'
import { prepareSeedEnv } from './lib/seed-env.js'
import {
  indexarClubes,
  chaveIndice,
  lerDataset,
  carregarMunicipios,
  validadorCidade,
  melhorCandidato,
  agruparPorUf,
} from './lib/catalogo-clubes.js'
import { RIVALIDADES_CLUBES } from '../src/data/rivalidades-clubes.js'

prepareSeedEnv({ scriptLabel: 'audit:catalogo-clubes' })

const JSON_OUT = process.argv.includes('--json')
const db = new PrismaClient()

/**
 * @param {string} titulo
 * @param {Record<string, string | number>} linhas
 */
function bloco(titulo, linhas) {
  if (JSON_OUT) return
  console.log(`\n── ${titulo} ${'─'.repeat(Math.max(0, 58 - titulo.length))}`)
  for (const [chave, valor] of Object.entries(linhas)) {
    console.log(`   ${chave.padEnd(42)} ${valor}`)
  }
}

async function main() {
  const ranking = lerDataset('cbf-ranking-clubes-2026.json')
  const fpf = lerDataset('fpf-torcidas-cadastradas-sp.json')
  const { valida: cidadeValida } = validadorCidade(carregarMunicipios())

  const afiliacoes = await db.afiliacao.findMany({
    select: {
      id: true, nome: true, estado: true, cidade: true, serie: true, escudoUrl: true,
      apiExternalId: true, fundacaoAno: true, estadio: true, estadioCapacidade: true,
      estadioLat: true, siteOficial: true, corPrimaria: true, wikidataQid: true,
      rncPosicao: true, torcedoresEstimadosTipo: true,
    },
  })
  const { indice, colisoes } = indexarClubes(afiliacoes)
  const porUf = agruparPorUf(afiliacoes)

  // 1. Cobertura do RNC ────────────────────────────────────────────────────
  const ausentesRnc = []
  for (const item of ranking.clubes ?? []) {
    const chave = chaveIndice(item.clube, item.uf)
    if (indice.has(chave) || colisoes.has(chave)) continue
    const { score } = melhorCandidato(item.clube, porUf.get(item.uf) ?? [])
    if (score < 0.8) ausentesRnc.push(`${item.pos}º ${item.clube}/${item.uf}`)
  }
  const comRnc = afiliacoes.filter((a) => a.rncPosicao != null).length

  bloco('1. Ranking Nacional de Clubes (CBF)', {
    'clubes no catálogo': afiliacoes.length,
    [`clubes no RNC ${ranking.edicao ?? ''}`]: ranking.total,
    'com posição do RNC gravada': comRnc,
    'do RNC ausentes do catálogo': ausentesRnc.length,
    'no catálogo sem RNC (histórico/amador)': afiliacoes.length - comRnc,
  })
  if (!JSON_OUT && ausentesRnc.length > 0) {
    console.log(`   → ${ausentesRnc.slice(0, 15).join(', ')}${ausentesRnc.length > 15 ? '…' : ''}`)
  }

  // 2. Ficha do clube ──────────────────────────────────────────────────────
  const pct = (n) => `${n} (${Math.round((n / afiliacoes.length) * 100)}%)`
  bloco('2. Ficha do clube', {
    'com escudo': pct(afiliacoes.filter((a) => a.escudoUrl).length),
    'com série': pct(afiliacoes.filter((a) => a.serie).length),
    'com ano de fundação': pct(afiliacoes.filter((a) => a.fundacaoAno).length),
    'com estádio': pct(afiliacoes.filter((a) => a.estadio).length),
    'com capacidade do estádio': pct(afiliacoes.filter((a) => a.estadioCapacidade).length),
    'com coordenada do estádio': pct(afiliacoes.filter((a) => a.estadioLat != null).length),
    'com site oficial': pct(afiliacoes.filter((a) => a.siteOficial).length),
    'com cor primária': pct(afiliacoes.filter((a) => a.corPrimaria).length),
    'com QID do Wikidata': pct(afiliacoes.filter((a) => a.wikidataQid).length),
    'com id da API-Football': pct(afiliacoes.filter((a) => a.apiExternalId).length),
  })

  // 3. Cidade contra a malha do IBGE ───────────────────────────────────────
  const cidadeInvalida = afiliacoes.filter((a) => !cidadeValida(a.cidade, a.estado))
  bloco('3. Cidade x malha municipal do IBGE', {
    'cidade válida na UF': pct(afiliacoes.length - cidadeInvalida.length),
    'cidade inválida ou vazia': cidadeInvalida.length,
  })
  if (!JSON_OUT && cidadeInvalida.length > 0) {
    console.log(
      `   → ${cidadeInvalida.slice(0, 10).map((a) => `${a.nome}: "${a.cidade ?? ''}"/${a.estado}`).join(' · ')}`,
    )
  }

  // 4. Rivalidades ─────────────────────────────────────────────────────────
  const rivalidades = await db.rivalidadeClube.findMany({
    select: {
      escopo: true,
      afiliacaoA: { select: { nome: true, estado: true } },
      afiliacaoB: { select: { nome: true, estado: true } },
    },
  })
  // Problema não é "existir par entre UFs" — é ele estar com escopo que isola.
  // `INTERESTADUAL` fica gravado de propósito, como contexto.
  const interestaduaisIsolando = rivalidades.filter(
    (r) => r.afiliacaoA.estado !== r.afiliacaoB.estado && r.escopo !== 'INTERESTADUAL',
  )
  const interestaduaisContexto = rivalidades.filter((r) => r.escopo === 'INTERESTADUAL')
  const gravadas = new Set(
    rivalidades.map((r) =>
      [
        chaveIndice(r.afiliacaoA.nome, r.afiliacaoA.estado),
        chaveIndice(r.afiliacaoB.nome, r.afiliacaoB.estado),
      ].sort().join('::'),
    ),
  )
  const isolantesDoDataset = RIVALIDADES_CLUBES.filter((par) => par.isola)
  const faltandoDoDataset = isolantesDoDataset.filter(
    (par) =>
      !gravadas.has([chaveIndice(par.a, par.uf), chaveIndice(par.b, par.uf)].sort().join('::')),
  )
  bloco('4. Rivalidade de clube', {
    'pares gravados': rivalidades.length,
    'pares que isolam (municipal + estadual)': rivalidades.length - interestaduaisContexto.length,
    'no dataset curado (isolam / total)': `${isolantesDoDataset.length} / ${RIVALIDADES_CLUBES.length}`,
    'do dataset ainda não gravados': faltandoDoDataset.length,
    'interestaduais gravados como contexto (não isolam)': interestaduaisContexto.length,
    'entre UFs diferentes AINDA isolando (erro)': interestaduaisIsolando.length,
  })
  if (!JSON_OUT && faltandoDoDataset.length > 0) {
    console.log(
      `   → faltam: ${faltandoDoDataset.slice(0, 8).map((p) => `${p.a} x ${p.b} (${p.uf})`).join(' · ')}`,
    )
  }
  if (!JSON_OUT && interestaduaisIsolando.length > 0) {
    console.log(
      `   → ERRO: ${interestaduaisIsolando.map((r) => `${r.afiliacaoA.nome}/${r.afiliacaoA.estado} x ${r.afiliacaoB.nome}/${r.afiliacaoB.estado}`).join(' · ')}`,
    )
  }

  // 5. Torcidas SP x registro da FPF ───────────────────────────────────────
  const torcidasSp = await db.torcidaConhecida.count({ where: { uf: 'SP' } })
  const registradas = await db.torcidaConhecida.count({
    where: { situacaoRegistro: 'REGISTRADA_FEDERACAO' },
  })
  const semRegistro = await db.torcidaConhecida.count({
    where: { uf: 'SP', situacaoRegistro: 'SEM_REGISTRO_CONHECIDO' },
  })
  const comFundacaoAno = await db.torcidaConhecida.count({ where: { fundacaoAno: { not: null } } })
  const totalTorcidas = await db.torcidaConhecida.count()
  bloco('5. Torcidas x registro da federação', {
    'torcidas no catálogo': totalTorcidas,
    'torcidas de SP': torcidasSp,
    'lista oficial da FPF': fpf.total,
    'marcadas como registradas': registradas,
    'de SP sem registro conhecido': semRegistro,
    'com ano de fundação normalizado': comFundacaoAno,
  })

  // 6. Homônimos ───────────────────────────────────────────────────────────
  bloco('6. Homônimos (nome+UF não separa)', {
    'grupos em colisão': colisoes.size,
  })
  if (!JSON_OUT) {
    for (const [chave, lista] of colisoes) {
      console.log(`   → ${chave}: ${lista.map((c) => c.nome).join(' | ')}`)
    }
  }

  const problemas = interestaduaisIsolando.length + colisoes.size
  if (JSON_OUT) {
    console.log(
      JSON.stringify(
        {
          clubes: afiliacoes.length,
          rncTotal: ranking.total,
          rncAusentes: ausentesRnc.length,
          comRnc,
          cidadeInvalida: cidadeInvalida.length,
          rivalidadesGravadas: rivalidades.length,
          rivalidadesFaltando: faltandoDoDataset.length,
          rivalidadesInterestaduaisIsolando: interestaduaisIsolando.length,
          rivalidadesInterestaduaisContexto: interestaduaisContexto.length,
          torcidasRegistradas: registradas,
          homonimos: colisoes.size,
        },
        null,
        2,
      ),
    )
  } else {
    console.log(
      `\n${problemas === 0 ? '✓' : '⚠'} ${problemas} problema(s) estrutural(is)` +
        ' (rivalidade interestadual isolando + homônimo).',
    )
  }
  if (problemas > 0) process.exitCode = 1
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
