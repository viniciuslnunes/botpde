/**
 * Escudos de clubes (Afiliacao) via Soccer Wiki + Cloudinary.
 *
 * Varre https://pt-br.soccerwiki.org/country.php?countryId=BRA&action=clubs
 * (offset 0…350, passo 50 — para quando a página vier vazia), casa cada clube
 * com Afiliacao sem escudoUrl e hospeda o PNG (fundo transparente) em
 * `torcida/catalogo/escudos/<slug>`.
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
  getCloudinaryConfig,
  uploadImageUrl,
  isCloudinaryUrl,
  FOLDER_ESCUDOS,
  MONOREPO_ROOT,
} from './lib/cloudinary-admin.js'
import { prepareSeedEnv } from './lib/seed-env.js'
import { gerarSlugUnico } from '../src/data/afiliacoes-normalize.js'
import { scoreWikiAfiliacao } from '../src/data/escudos-wiki-match.js'

prepareSeedEnv({ requireCloudinary: true, scriptLabel: 'seed:escudos-soccerwiki' })

const __dir = dirname(fileURLToPath(import.meta.url))
const DRY_RUN = process.argv.includes('--dry-run')
const REPORT_ONLY = process.argv.includes('--report-only')
const WIKI_OFFSET_STEP = 50
const WIKI_OFFSET_MAX = 350
const WIKI_BASE = 'https://pt-br.soccerwiki.org/country.php?countryId=BRA&action=clubs'
const DELAY_MS = 120

const db = new PrismaClient()

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
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
  for (let offset = 0; offset <= WIKI_OFFSET_MAX; offset += WIKI_OFFSET_STEP) {
    const pagina = await scrapePagina(offset)
    if (pagina.length === 0) {
      console.log(`  offset ${offset}: fim da listagem`)
      break
    }
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
