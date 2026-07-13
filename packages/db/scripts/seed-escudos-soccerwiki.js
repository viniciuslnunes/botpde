/**
 * Escudos de clubes (Afiliacao) via Soccer Wiki + Cloudinary.
 *
 * Varre https://pt-br.soccerwiki.org/country.php?countryId=BRA&action=clubs
 * (offset 0…300, passo 50), casa cada clube com Afiliacao sem escudoUrl e
 * hospeda o PNG (fundo transparente) em `torcida/catalogo/escudos/<slug>`.
 *
 *   pnpm --filter @torcida/db seed:escudos-soccerwiki
 *   pnpm --filter @torcida/db seed:escudos-soccerwiki -- --dry-run
 *   pnpm --filter @torcida/db seed:escudos-soccerwiki -- --report-only
 *
 * REQUER REDE + CLOUDINARY_* + DATABASE_URL.
 */
import { writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'
import {
  normalizeNome,
  chaveMatch,
  chaveGrupoClube,
  saoMesmoClube,
  gerarSlugUnico,
  inferirUfDoNome,
} from '../src/data/afiliacoes-normalize.js'
import {
  loadEnvFiles,
  getCloudinaryConfig,
  uploadImageUrl,
  isCloudinaryUrl,
  FOLDER_ESCUDOS,
  MONOREPO_ROOT,
} from './lib/cloudinary-admin.js'

loadEnvFiles()

const __dir = dirname(fileURLToPath(import.meta.url))
const DRY_RUN = process.argv.includes('--dry-run')
const REPORT_ONLY = process.argv.includes('--report-only')
const OFFSETS = [0, 50, 100, 150, 200, 250, 300]
const WIKI_BASE = 'https://pt-br.soccerwiki.org/country.php?countryId=BRA&action=clubs'
const DELAY_MS = 120

/** Aliases de nomes no Soccer Wiki → nome curto do diretório. */
const WIKI_ALIASES = {
  'cr flamengo': 'flamengo',
  'regatas flamengo': 'flamengo',
  'clube de regatas flamengo': 'flamengo',
  'botafogo fr': 'botafogo',
  'botafogo de futebol e regatas': 'botafogo',
  'sc internacional': 'internacional',
  'sport club internacional': 'internacional',
  'rb bragantino': 'bragantino',
  'red bull bragantino': 'bragantino',
  'ec bahia': 'bahia',
  'ec vitoria': 'vitoria',
  'cruzeiro ec': 'cruzeiro',
  'atletico mineiro': 'atletico mineiro',
  'athletico paranaense': 'athletico paranaense',
  'clube do remo': 'remo',
  'america mineiro': 'america mineiro',
  'america de natal': 'america de natal',
  'ceara sc': 'ceara',
  'fortaleza ec': 'fortaleza',
  'cuiaba ec': 'cuiaba',
  'guarani fc': 'guarani',
  'avai fc': 'avai',
  'santos fc': 'santos',
  'mirassol fc': 'mirassol',
  'sport recife': 'sport',
  'clube de regatas brasil': 'brasil',
  'ponte preta': 'ponte preta',
  'atletico goianiense': 'atletico goianiense',
  'gremio novorizontino': 'novorizontino',
  'londrina ec': 'londrina',
  'botafogo pb': 'botafogo',
  'botafogo sp': 'botafogo',
  'operario ferroviario ec': 'operario',
  'joinville ec': 'joinville',
  'criciuma ec': 'criciuma',
  'chapecoense af': 'chapecoense',
  'figueirense': 'figueirense',
  'paysandu sc': 'paysandu',
  'parana clube': 'parana',
  'sao bernardo fc': 'sao bernardo',
}

const db = new PrismaClient()

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/** @param {string} nome */
function chaveWiki(nome) {
  const nm = normalizeNome(nome)
  const alias = WIKI_ALIASES[nm]
  return alias ? chaveMatch(alias) : chaveMatch(nome)
}

/** Tokens genéricos — não contam para casamento parcial. */
const TOKENS_GENERICOS = new Set([
  'sport', 'sports', 'clube', 'club', 'futebol', 'esporte', 'esportivo',
  'atletico', 'athletico', 'associacao', 'recreativo', 'regatas', 'football',
])

/** Nomes que existem em vários estados — exige UF explícita no wiki. */
const CHAVES_HOMONIMAS = new Set([
  'america', 'operario', 'botafogo', 'vitoria', 'atletico', 'gremio', 'sport',
  'paulista', 'portuguesa', 'internacional', 'nautico', 'juventude',
])

/**
 * @param {{ nome: string, cidade?: string|null }} wiki
 * @param {{ nome: string, estado: string|null }} afiliacao
 * @returns {number} 0 = sem match; maior = melhor
 */
function scoreWikiAfiliacao(wiki, afiliacao) {
  const ufWiki = inferirUfDoNome(wiki.nome)
  const ufAf = afiliacao.estado?.toUpperCase() ?? null

  if (ufWiki && ufAf && ufWiki !== ufAf) return 0

  const refWiki = { nome: wiki.nome, estado: ufWiki ?? ufAf }
  if (ufWiki && ufAf && saoMesmoClube(refWiki, afiliacao)) return 100

  const kw = chaveWiki(wiki.nome)
  const ka = chaveMatch(afiliacao.nome)
  const grupoA = chaveGrupoClube(afiliacao.nome, afiliacao.estado)
  const grupoW = chaveGrupoClube(wiki.nome, ufWiki ?? ufAf ?? '')

  if (ufWiki && ufAf && grupoA === grupoW) return 95
  if (kw === ka) {
    const homonimo = CHAVES_HOMONIMAS.has(kw) || CHAVES_HOMONIMAS.has(kw.split(' ')[0] ?? '')
    if (homonimo && (!ufWiki || !ufAf || ufWiki !== ufAf)) return 0
    if (!ufWiki || !ufAf || ufWiki === ufAf) return 90
    return 0
  }

  return 0
}

/**
 * @param {number} offset
 * @returns {Promise<Array<{ nome: string, logoUrl: string, cidade: string|null }>>}
 */
async function scrapePagina(offset) {
  const url = `${WIKI_BASE}&offset=${offset}`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'TorcidaBot/1.0 (escudos; contato@torcida.local)' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} em offset ${offset}`)
  const html = await res.text()
  /** @type {Array<{ nome: string, logoUrl: string, cidade: string|null }>} */
  const clubs = []

  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
  for (const row of rows) {
    const r = row[1]
    const logoMatch = r.match(
      /https:\/\/cdn\.soccerwiki\.org\/images\/logos\/clubs\/(\d+)\.png/,
    )
    const nameMatch = r.match(
      /<a[^>]+href="\/squad\.php\?clubid=\d+"[^>]*>([^<]+)<\/a>/i,
    )
    if (!logoMatch || !nameMatch) continue

    const tds = [...r.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) =>
      m[1].replace(/<[^>]+>/g, '').trim(),
    )
    // Colunas: logo | nome | técnico | liga | estádio | local | fundação
    const cidade = tds.length >= 6 ? tds[5] || null : null

    clubs.push({
      nome: nameMatch[1].trim(),
      logoUrl: logoMatch[0],
      cidade,
    })
  }
  return clubs
}

/**
 * @param {string} logoUrl
 * @param {string} slug
 * @param {string | null} existente
 */
async function hospedarEscudo(logoUrl, slug, existente) {
  if (existente && isCloudinaryUrl(existente)) return existente
  if (!getCloudinaryConfig()) return null
  if (DRY_RUN) return `https://res.cloudinary.com/dry-run/${FOLDER_ESCUDOS}/${slug}.png`
  return uploadImageUrl(logoUrl, { folder: FOLDER_ESCUDOS, publicId: slug })
}

async function main() {
  console.log('Escudos Soccer Wiki — scrape + casamento + Cloudinary')
  if (DRY_RUN) console.log('(dry-run: sem gravação)')
  if (REPORT_ONLY) console.log('(report-only: só mapeia, sem upload)')

  if (!getCloudinaryConfig() && !DRY_RUN && !REPORT_ONLY) {
    console.warn('⚠ CLOUDINARY_* não configurado — abortando.')
    process.exit(1)
  }

  /** @type {Array<{ nome: string, logoUrl: string, cidade: string|null }>} */
  const wikiClubes = []
  for (const offset of OFFSETS) {
    const pagina = await scrapePagina(offset)
    wikiClubes.push(...pagina)
    console.log(`  offset ${offset}: ${pagina.length} clubes`)
    await sleep(DELAY_MS)
  }
  console.log(`  total Soccer Wiki: ${wikiClubes.length}`)

  /** @type {Array<{ id: string, nome: string, estado: string|null, slug: string|null, escudoUrl: string|null }>} */
  const semEscudo = await db.afiliacao.findMany({
    where: { escudoUrl: null },
    select: { id: true, nome: true, estado: true, slug: true, escudoUrl: true },
    orderBy: { nome: 'asc' },
  })
  console.log(`  afiliações sem escudo: ${semEscudo.length}`)

  /** @type {Set<string>} */
  const slugsUsados = new Set(
    (await db.afiliacao.findMany({ where: { slug: { not: null } }, select: { slug: true } }))
      .map((a) => a.slug)
      .filter(Boolean),
  )

  /** @type {Array<{ score: number, afiliacaoId: string, nome: string, estado: string|null, wikiNome: string, logoUrl: string, slug: string }>} */
  const candidatos = []

  for (const af of semEscudo) {
    for (const wiki of wikiClubes) {
      const score = scoreWikiAfiliacao(wiki, af)
      if (score < 90) continue
      const slug = af.slug ?? gerarSlugUnico(af.nome, af.estado ?? '', slugsUsados)
      candidatos.push({
        score,
        afiliacaoId: af.id,
        nome: af.nome,
        estado: af.estado,
        wikiNome: wiki.nome,
        logoUrl: wiki.logoUrl,
        slug,
      })
    }
  }

  candidatos.sort((a, b) => b.score - a.score)

  /** @type {Array<{ afiliacaoId: string, nome: string, estado: string|null, wikiNome: string, logoUrl: string, slug: string, score: number }>} */
  const mapeados = []
  /** @type {Set<string>} */
  const afUsados = new Set()
  /** @type {Set<string>} */
  const wikiUsados = new Set()
  /** @type {string[]} */
  const semMatch = []

  for (const c of candidatos) {
    if (afUsados.has(c.afiliacaoId) || wikiUsados.has(c.logoUrl)) continue
    afUsados.add(c.afiliacaoId)
    wikiUsados.add(c.logoUrl)
    mapeados.push(c)
  }

  for (const af of semEscudo) {
    if (!afUsados.has(af.id)) semMatch.push(`${af.nome} (${af.estado ?? '?'})`)
  }

  const reportPath = resolve(
    MONOREPO_ROOT,
    'packages/db/src/data/escudos-soccerwiki-report.json',
  )
  const report = {
    geradoEm: new Date().toISOString(),
    wikiTotal: wikiClubes.length,
    semEscudoAntes: semEscudo.length,
    mapeados: mapeados.length,
    semMatch: semMatch.length,
    pares: mapeados.map((m) => ({
      clube: m.nome,
      uf: m.estado,
      wiki: m.wikiNome,
      slug: m.slug,
      score: m.score,
    })),
    semMatchLista: semMatch,
  }
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8')
  console.log(`\nRelatório: ${reportPath}`)
  console.log(`  mapeados : ${mapeados.length}`)
  console.log(`  sem match: ${semMatch.length}`)

  if (REPORT_ONLY) return

  let enviados = 0
  let erros = 0
  for (const m of mapeados) {
    try {
      const escudoUrl = await hospedarEscudo(m.logoUrl, m.slug, null)
      if (!escudoUrl) {
        console.warn(`  ! sem upload: ${m.nome}`)
        continue
      }
      if (!DRY_RUN) {
        await db.afiliacao.update({
          where: { id: m.afiliacaoId },
          data: { escudoUrl, ...(m.slug ? { slug: m.slug } : {}) },
        })
      }
      enviados += 1
      if (enviados % 25 === 0) console.log(`  … ${enviados} escudos`)
      await sleep(DELAY_MS)
    } catch (err) {
      erros += 1
      console.warn(`  ! ${m.nome}: ${err.message}`)
    }
  }

  const restantes = DRY_RUN
    ? semEscudo.length - mapeados.length
    : await db.afiliacao.count({ where: { escudoUrl: null } })

  console.log('\nResumo:')
  console.log(`  escudos enviados : ${enviados}`)
  console.log(`  erros            : ${erros}`)
  console.log(`  sem escudo ainda : ${restantes}`)
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
