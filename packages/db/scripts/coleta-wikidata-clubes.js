/**
 * Coleta a ficha dos clubes brasileiros no Wikidata e regenera o dataset
 * versionado `src/data/wikidata-clubes-br.json`.
 *
 *   pnpm --filter @torcida/db coleta:wikidata-clubes
 *   pnpm --filter @torcida/db coleta:wikidata-clubes -- --dry-run
 *
 * Não toca no banco — só rede e arquivo. `seed:ficha-clubes` é quem escreve.
 *
 * Por que o dataset ganhou `descricao` e `tipos` (2026-09-01): o Wikidata tem
 * uma entidade SEPARADA para o time FEMININO, o time B e o time de futsal/beach
 * soccer, todas com o MESMO rótulo do clube principal ("Sport Club Corinthians
 * Paulista", "Clube de Regatas do Flamengo"). Sem discriminador, o casamento por
 * nome+UF escolhia a primeira que aparecesse — e a ficha do Corinthians virava a
 * do time feminino (1997, Estádio Alfredo Schürig). `tipos` (P31) pega os casos
 * tipados (futebol feminino, futsal, beach soccer) e `descricao` (pt) pega o
 * resto, que o Wikidata só distingue em texto livre.
 *
 * Colapso de linhas: o SPARQL devolve uma linha por combinação de estádio/site/
 * fundação. Um clube com mais de um estádio declarado fica com o de MAIOR
 * capacidade (a casa do time principal); o MESMO estádio com várias capacidades
 * fica com a MENOR (o Wikidata guarda o recorde histórico ao lado da lotação de
 * jogo — Morumbi 120.000/71.200/67.052). Os demais campos ficam com o primeiro
 * valor não vazio — determinístico entre coletas.
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { MONOREPO_ROOT } from './lib/cloudinary-admin.js'

const DRY_RUN = process.argv.includes('--dry-run')
const DESTINO = resolve(MONOREPO_ROOT, 'packages/db/src/data/wikidata-clubes-br.json')
const ENDPOINT = 'https://query.wikidata.org/sparql'

const SPARQL = `
SELECT ?clube ?clubeLabel ?descricao ?descricaoEn ?fundacao ?dissolucao ?cidadeLabel ?estadioLabel
       ?capacidade ?site ?nomeOficial ?coord
       (GROUP_CONCAT(DISTINCT ?tipoId; separator=",") AS ?tipos)
WHERE {
  ?clube wdt:P31/wdt:P279* wd:Q476028 .
  # País (P17) OU sede (P159) em município brasileiro: o P17 de alguns verbetes
  # aponta a COMPETIÇÃO em vez do país (o ABC de Natal aponta a Série C), e sem a
  # segunda alternativa o clube some da coleta inteira.
  { ?clube wdt:P17 wd:Q155 } UNION { ?clube wdt:P159/wdt:P17 wd:Q155 }
  OPTIONAL { ?clube wdt:P571 ?fundacao }
  OPTIONAL { ?clube wdt:P576 ?dissolucao }
  OPTIONAL { ?clube wdt:P159 ?cidade }
  OPTIONAL { ?clube wdt:P115 ?estadio .
             OPTIONAL { ?estadio wdt:P1083 ?capacidade }
             OPTIONAL { ?estadio wdt:P625 ?coord } }
  OPTIONAL { ?clube wdt:P856 ?site }
  OPTIONAL { ?clube wdt:P1448 ?nomeOficial }
  OPTIONAL { ?clube wdt:P31 ?tipo . BIND(STRAFTER(STR(?tipo), "entity/") AS ?tipoId) }
  OPTIONAL { ?clube schema:description ?descricao FILTER(LANG(?descricao) = "pt") }
  OPTIONAL { ?clube schema:description ?descricaoEn FILTER(LANG(?descricaoEn) = "en") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "pt,en". }
}
GROUP BY ?clube ?clubeLabel ?descricao ?descricaoEn ?fundacao ?dissolucao ?cidadeLabel ?estadioLabel
         ?capacidade ?site ?nomeOficial ?coord
`

/** @param {{ value: string } | undefined} campo */
const txt = (campo) => (campo?.value ?? '').trim() || null

/** `Point(-46.474 -23.5455)` → `{ lat, lng }` */
function parseCoord(wkt) {
  const m = /Point\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)/.exec(wkt ?? '')
  return m ? { lat: Number(m[2]), lng: Number(m[1]) } : { lat: null, lng: null }
}

/** Acumula cada estádio do clube com a MENOR capacidade declarada para ele. */
function registrarEstadio(acumulado, linha) {
  if (!linha.estadio) return
  const atual = acumulado.estadios.get(linha.estadio)
  // O mesmo estádio costuma ter várias capacidades sem ranking no Wikidata: o
  // recorde histórico, a configuração de show e a lotação de jogo (Morumbi:
  // 120.000 / 71.200 / 67.052; Neo Química Arena: 68.034 / 47.252). A menor é a
  // lotação atual de futebol — a única que faz sentido numa ficha de clube.
  if (!atual || (linha.capacidade ?? Infinity) < (atual.capacidade ?? Infinity)) {
    acumulado.estadios.set(linha.estadio, {
      capacidade: linha.capacidade,
      lat: linha.estadioLat,
      lng: linha.estadioLng,
    })
  }
}

/** Entre estádios DIFERENTES fica o maior: é a casa do time principal. */
function escolherEstadio(acumulado) {
  let nome = null
  let melhor = null
  for (const [candidato, dados] of acumulado.estadios) {
    if (!melhor || (dados.capacidade ?? 0) > (melhor.capacidade ?? 0)) {
      nome = candidato
      melhor = dados
    }
  }
  acumulado.estadio = nome
  acumulado.capacidade = melhor?.capacidade ?? null
  acumulado.estadioLat = melhor?.lat ?? null
  acumulado.estadioLng = melhor?.lng ?? null
}

async function main() {
  const url = `${ENDPOINT}?format=json&query=${encodeURIComponent(SPARQL)}`
  const resposta = await fetch(url, {
    headers: {
      'User-Agent': 'torcida-saas-catalogo/1.0 (catalogo de clubes; contato via repo)',
      Accept: 'application/sparql-results+json',
    },
  })
  if (!resposta.ok) {
    throw new Error(`SPARQL ${resposta.status}: ${(await resposta.text()).slice(0, 300)}`)
  }
  const { results } = await resposta.json()

  /** @type {Map<string, any>} */
  const porQid = new Map()
  for (const b of results.bindings) {
    const qid = b.clube.value.split('/').pop()
    const { lat, lng } = parseCoord(txt(b.coord))
    // O serviço de rótulo devolve o próprio QID quando a entidade não tem label
    // em pt/en — isso não é nome de estádio, é ruído; sem nome, capacidade e
    // coordenada também não têm a que se referir.
    const rotulo = txt(b.estadioLabel)
    const estadio = rotulo && !/^Q\d+$/.test(rotulo) ? rotulo : null
    const linha = {
      qid,
      nome: txt(b.clubeLabel) ?? qid,
      descricao: txt(b.descricao) ?? txt(b.descricaoEn),
      tipos: (txt(b.tipos) ?? '').split(',').filter(Boolean),
      fundacao: (txt(b.fundacao) ?? '').slice(0, 10) || null,
      dissolucao: (txt(b.dissolucao) ?? '').slice(0, 10) || null,
      cidade: txt(b.cidadeLabel),
      estadio,
      capacidade: estadio && txt(b.capacidade) ? Number(txt(b.capacidade)) : null,
      site: txt(b.site),
      nomeOficial: txt(b.nomeOficial),
      estadioLat: estadio ? lat : null,
      estadioLng: estadio ? lng : null,
    }
    const anterior = porQid.get(qid)
    if (!anterior) {
      porQid.set(qid, { ...linha, estadios: new Map() })
      registrarEstadio(porQid.get(qid), linha)
      continue
    }
    registrarEstadio(anterior, linha)
    for (const campo of ['descricao', 'fundacao', 'dissolucao', 'cidade', 'site', 'nomeOficial']) {
      if (!anterior[campo] && linha[campo]) anterior[campo] = linha[campo]
    }
    for (const tipo of linha.tipos) if (!anterior.tipos.includes(tipo)) anterior.tipos.push(tipo)
  }

  const clubes = [...porQid.values()].sort((a, b) => a.qid.localeCompare(b.qid))
  for (const c of clubes) {
    c.tipos.sort()
    escolherEstadio(c)
    delete c.estadios
  }

  const saida = {
    fonte:
      'Wikidata Query Service (SPARQL) — clubes de futebol (P31/P279* Q476028) com país (P17) = Brasil (Q155) OU sede (P159) em município brasileiro',
    endpoint: ENDPOINT,
    licenca: 'CC0 1.0 (dados do Wikidata)',
    coletadoEm: new Date().toISOString().slice(0, 10),
    propriedades: {
      fundacao: 'P571',
      dissolucao: 'P576 (clube extinto — desempata homônimo com o sucessor)',
      cidade: 'P159 (sede)',
      estadio: 'P115',
      capacidade: 'P1083 do estádio',
      site: 'P856',
      nomeOficial: 'P1448',
      coordenadaEstadio: 'P625 do estádio',
      tipos: 'P31 (separa time feminino / futsal / beach soccer do clube principal)',
      descricao: 'schema:description em pt (cai para en quando não há pt)',
    },
    total: clubes.length,
    clubes,
  }

  console.log(`Wikidata: ${results.bindings.length} linhas → ${clubes.length} clubes`)
  if (existsSync(DESTINO)) {
    const atual = JSON.parse(readFileSync(DESTINO, 'utf8'))
    const antes = new Set((atual.clubes ?? []).map((c) => c.qid))
    const depois = new Set(clubes.map((c) => c.qid))
    const novos = [...depois].filter((q) => !antes.has(q))
    const sumiram = [...antes].filter((q) => !depois.has(q))
    console.log(`  novos: ${novos.length} · sumiram: ${sumiram.length}`)
    if (sumiram.length > 0) console.log(`  sumiram: ${sumiram.join(', ')}`)
  }
  const comDescricao = clubes.filter((c) => c.descricao).length
  console.log(`  com descrição: ${comDescricao} (${Math.round((comDescricao / clubes.length) * 100)}%)`)

  if (DRY_RUN) {
    console.log('(dry-run — nada gravado)')
    return
  }
  writeFileSync(DESTINO, `${JSON.stringify(saida, null, 1)}\n`, 'utf8')
  console.log(`✓ ${DESTINO}`)
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
