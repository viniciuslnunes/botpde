/**
 * Cruza TORCIDAS_BRASIL com o scraper organizadasbrasil (torcidas-conhecidas).
 * Offline — sem DATABASE_URL.
 *
 *   node scripts/generate-sedes-from-catalogo.js
 *   node scripts/generate-sedes-from-catalogo.js -- --json
 */
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TORCIDAS_BRASIL } from '../src/data/torcidas-brasil.js'
import { TORCIDAS_CONHECIDAS } from '../src/data/torcidas-conhecidas.js'
import { normalizeNome, saoMesmoClube } from '../src/data/afiliacoes-normalize.js'

const __dir = dirname(fileURLToPath(import.meta.url))
const JSON_OUT = process.argv.includes('--json')

const STOP_TOKENS = new Set([
  'torcida',
  'organizada',
  'movimento',
  'uniformizada',
  'fiel',
  'jovem',
  'do',
  'da',
  'dos',
  'das',
  'de',
  'e',
  'o',
  'a',
  'um',
  'uma',
])

/**
 * @param {string} nome
 * @returns {string[]}
 */
function tokensTorcida(nome) {
  return normalizeNome(nome)
    .split(' ')
    .filter((t) => t.length > 0 && (t.length > 2 || /^\d+$/.test(t)) && !STOP_TOKENS.has(t))
}

/**
 * @param {string} a
 * @param {string} b
 */
function nomesTorcidaCasam(a, b) {
  const ta = tokensTorcida(a)
  const tb = tokensTorcida(b)
  if (ta.length === 0 || tb.length === 0) return false

  const [menor, maior] = ta.length <= tb.length ? [ta, tb] : [tb, ta]
  const setMaior = new Set(maior)

  let hits = 0
  for (const t of menor) {
    if (setMaior.has(t)) {
      hits += 1
      continue
    }
    if (maior.some((m) => m.includes(t) || t.includes(m))) hits += 1
  }

  const minHits = menor.length <= 2 ? menor.length : Math.ceil(menor.length * 0.6)
  return hits >= minHits
}

/**
 * @param {{ nome: string, clube: string, estado: string }} curada
 * @param {import('../src/data/torcidas-conhecidas.js').TorcidaConhecidaSeed} conhecida
 */
function mesmoClubeCurada(curada, conhecida) {
  if (!conhecida.clubeNomeOriginal) return false
  return saoMesmoClube(
    { nome: curada.clube, estado: curada.estado },
    { nome: conhecida.clubeNomeOriginal, estado: conhecida.uf },
  )
}

/**
 * @param {string | null | undefined} v
 */
function temTexto(v) {
  return typeof v === 'string' && v.trim().length > 0
}

/**
 * Heurística: endereço com rua/número vs só "Cidade - UF".
 * @param {string | null} sede
 */
function pareceEnderecoCompleto(sede) {
  if (!temTexto(sede)) return false
  const s = sede.trim()
  if (/\d/.test(s) && /,|rua|r\.|av\.|avenida|rod\./i.test(s)) return true
  if (s.length > 25 && s.includes(',')) return true
  return false
}

/**
 * @param {{ nome: string, clube: string, estado: string }} curada
 */
function acharMatchConhecida(curada) {
  const candidatas = TORCIDAS_CONHECIDAS.filter((tc) => mesmoClubeCurada(curada, tc))
  const porNome = candidatas.filter((tc) => nomesTorcidaCasam(curada.nome, tc.nome))
  if (porNome.length === 1) return porNome[0]
  if (porNome.length > 1) {
    porNome.sort((a, b) => tokensTorcida(b.nome).length - tokensTorcida(a.nome).length)
    return porNome[0]
  }
  return null
}

/** Clubes únicos do diretório nacional curado */
const clubesBrasil = [...new Set(TORCIDAS_BRASIL.map((t) => `${t.clube}|${t.estado}`))].map((k) => {
  const [clube, estado] = k.split('|')
  return { clube, estado }
})

/** Entradas do scraper cujo clube casa com algum clube de TORCIDAS_BRASIL */
const conhecidasDosClubesBrasil = TORCIDAS_CONHECIDAS.filter((tc) =>
  clubesBrasil.some((c) => mesmoClubeCurada(c, tc)),
)

function main() {
  /** @type {Array<{ slug: string, nome: string, clube: string, matchNome: string | null, sede: string | null, subsedes: string | null }>} */
  const cruzamento = []

  for (const curada of TORCIDAS_BRASIL) {
    const match = acharMatchConhecida(curada)
    cruzamento.push({
      slug: curada.slug,
      nome: curada.nome,
      clube: curada.clube,
      matchNome: match?.nome ?? null,
      sede: match?.sede ?? null,
      subsedes: match?.subsedes ?? null,
    })
  }

  const comSede = cruzamento.filter((r) => temTexto(r.sede))
  const comSubsedes = cruzamento.filter((r) => temTexto(r.subsedes))
  const comEndereco = cruzamento.filter((r) => pareceEnderecoCompleto(r.sede))
  const slugsSemSede = cruzamento.filter((r) => !temTexto(r.sede)).map((r) => r.slug)
  const slugsSemMatch = cruzamento.filter((r) => !r.matchNome).map((r) => r.slug)

  const catalogoClubesBrasil = {
    total: conhecidasDosClubesBrasil.length,
    comSede: conhecidasDosClubesBrasil.filter((tc) => temTexto(tc.sede)).length,
    comSubsedes: conhecidasDosClubesBrasil.filter((tc) => temTexto(tc.subsedes)).length,
    comEnderecoCompleto: conhecidasDosClubesBrasil.filter((tc) => pareceEnderecoCompleto(tc.sede)).length,
  }

  const report = {
    geradoEm: new Date().toISOString(),
    torcidasBrasil: {
      total: TORCIDAS_BRASIL.length,
      comMatchCatalogo: cruzamento.filter((r) => r.matchNome).length,
      comSede: comSede.length,
      comSubsedes: comSubsedes.length,
      comEnderecoCompleto: comEndereco.length,
      semSede: slugsSemSede.length,
      slugsSemSede,
      slugsSemMatchCatalogo: slugsSemMatch,
    },
    catalogoScraper_clubesTorcidasBrasil: catalogoClubesBrasil,
    cruzamento,
  }

  const outPath = resolve(__dir, '../src/data/sedes-from-catalogo-report.json')
  writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8')

  if (JSON_OUT) {
    console.log(JSON.stringify(report, null, 2))
    return
  }

  console.log('Cruzamento TORCIDAS_BRASIL × torcidas-conhecidas\n')
  console.log('TORCIDAS_BRASIL:')
  console.log(`  total              : ${report.torcidasBrasil.total}`)
  console.log(`  match nome+clube   : ${report.torcidasBrasil.comMatchCatalogo}`)
  console.log(`  com sede (texto)   : ${report.torcidasBrasil.comSede}`)
  console.log(`  com subsedes       : ${report.torcidasBrasil.comSubsedes}`)
  console.log(`  endereço completo  : ${report.torcidasBrasil.comEnderecoCompleto}`)
  console.log(`  slugs sem sede     : ${report.torcidasBrasil.semSede}`)
  if (slugsSemSede.length) console.log(`    → ${slugsSemSede.join(', ')}`)
  console.log('\nCatálogo scraper (clubes de TORCIDAS_BRASIL):')
  console.log(`  entradas           : ${catalogoClubesBrasil.total}`)
  console.log(`  com sede           : ${catalogoClubesBrasil.comSede}`)
  console.log(`  com subsedes       : ${catalogoClubesBrasil.comSubsedes}`)
  console.log(`\nRelatório: ${outPath}`)
}

main()
