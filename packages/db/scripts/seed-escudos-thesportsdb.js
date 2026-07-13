/**
 * Escudos de Afiliacao sem escudoUrl via TheSportsDB + Cloudinary (Fase D).
 *
 *   pnpm --filter @torcida/db seed:escudos-thesportsdb
 *   pnpm --filter @torcida/db seed:escudos-thesportsdb -- --dry-run
 *   pnpm --filter @torcida/db seed:escudos-thesportsdb -- --report-only
 *   pnpm --filter @torcida/db seed:escudos-thesportsdb -- --sem-busca
 *
 * REQUER REDE + CLOUDINARY_* + DATABASE_URL.
 * THESPORTSDB_KEY (patrono) melhora cobertura das 4 ligas; fallback chave "3".
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'
import {
  LIGAS,
  indexarLiga,
  casarAfiliacaoIndice,
  casarAfiliacaoBusca,
  termosBuscaApi,
} from '../src/data/escudos-thesportsdb-match.js'
import {
  loadEnvFiles,
  getCloudinaryConfig,
  uploadImageUrl,
  isCloudinaryUrl,
  FOLDER_ESCUDOS,
  MONOREPO_ROOT,
} from './lib/cloudinary-admin.js'

loadEnvFiles()

const API_KEY = process.env.THESPORTSDB_KEY || '3'
const API_LIGAS = `https://www.thesportsdb.com/api/v1/json/${API_KEY}/search_all_teams.php`
const API_BUSCA = `https://www.thesportsdb.com/api/v1/json/${API_KEY}/searchteams.php`

const DRY_RUN = process.argv.includes('--dry-run')
const REPORT_ONLY = process.argv.includes('--report-only')
const SEM_BUSCA = process.argv.includes('--sem-busca')
const DELAY_MS = 250

const db = new PrismaClient()

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/** @param {string} url @param {number} [tentativas] */
async function fetchJson(url, tentativas = 4) {
  for (let i = 0; i < tentativas; i += 1) {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'TorcidaBot/1.0 (escudos; contato@torcida.local)' },
    })
    if (res.status === 429) {
      const espera = 2000 * (i + 1)
      console.warn(`  ! rate limit — aguardando ${espera}ms`)
      await sleep(espera)
      continue
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  }
  throw new Error('HTTP 429 (rate limit após retentativas)')
}

/**
 * @param {string} badgeUrl
 * @param {string} slug
 * @param {string | null} existente
 */
async function hospedarEscudo(badgeUrl, slug, existente) {
  if (existente && isCloudinaryUrl(existente)) return existente
  if (!getCloudinaryConfig()) return null
  if (DRY_RUN) return `https://res.cloudinary.com/dry-run/${FOLDER_ESCUDOS}/${slug}.png`
  return uploadImageUrl(badgeUrl, { folder: FOLDER_ESCUDOS, publicId: slug })
}

async function main() {
  console.log('Escudos TheSportsDB — índice + busca + Cloudinary')
  if (DRY_RUN) console.log('(dry-run)')
  if (REPORT_ONLY) console.log('(report-only)')
  if (SEM_BUSCA) console.log('(sem busca individual)')
  if (API_KEY === '3') {
    console.warn('⚠ THESPORTSDB_KEY não definida — usando chave pública "3" (cobertura limitada).')
  }

  if (!getCloudinaryConfig() && !DRY_RUN && !REPORT_ONLY) {
    console.warn('⚠ CLOUDINARY_* não configurado — abortando.')
    process.exit(1)
  }

  /** @type {Map<string, {nome:string,badge:string|null,serie:string,location:string|null}>} */
  const indice = new Map()
  for (const { liga, serie } of LIGAS) {
    try {
      const payload = await fetchJson(`${API_LIGAS}?l=${liga}`)
      indexarLiga(payload, serie, indice)
      console.log(`  API ${liga}: ${payload?.teams?.length ?? 0} times (índice ${indice.size})`)
      await sleep(DELAY_MS)
    } catch (err) {
      console.warn(`  ! ${liga}: ${err.message}`)
    }
  }

  /** @type {Array<{ id: string, nome: string, apelido: string | null, estado: string | null, slug: string | null }>} */
  const semEscudo = await db.afiliacao.findMany({
    where: { escudoUrl: null },
    select: { id: true, nome: true, apelido: true, estado: true, slug: true },
    orderBy: { nome: 'asc' },
  })
  console.log(`  afiliações sem escudo: ${semEscudo.length}`)

  /** @type {Array<{ id: string, nome: string, apelido: string | null, estado: string | null, slug: string | null, badge: string, apiNome: string, fonte: string, serie: string | null, idTeam: string | null }>} */
  const mapeados = []
  /** @type {string[]} */
  const semMatch = []

  for (const af of semEscudo) {
    let match = casarAfiliacaoIndice(af, indice)
    if (!match && !SEM_BUSCA) {
      for (const termo of termosBuscaApi(af)) {
        try {
          const payload = await fetchJson(`${API_BUSCA}?t=${encodeURIComponent(termo)}`)
          match = casarAfiliacaoBusca(af, payload?.teams)
          if (match) break
        } catch {
          // degradação graciosa
        }
        await sleep(DELAY_MS)
      }
    }

    if (!match?.badge) {
      semMatch.push(`${af.nome} (${af.estado ?? '?'})`)
      continue
    }

    mapeados.push({
      id: af.id,
      nome: af.nome,
      apelido: af.apelido,
      estado: af.estado,
      slug: af.slug,
      badge: match.badge,
      apiNome: match.nome,
      fonte: match.fonte,
      serie: match.serie || null,
      idTeam: match.idTeam,
    })
  }

  const reportPath = resolve(MONOREPO_ROOT, 'packages/db/src/data/escudos-thesportsdb-report.json')
  const report = {
    geradoEm: new Date().toISOString(),
    apiKey: API_KEY === '3' ? 'publica-3' : 'patrono',
    indiceTamanho: indice.size,
    semEscudoAntes: semEscudo.length,
    mapeados: mapeados.length,
    semMatch: semMatch.length,
    pares: mapeados.map((m) => ({
      clube: m.nome,
      uf: m.estado,
      api: m.apiNome,
      fonte: m.fonte,
      slug: m.slug,
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
      const slug = m.slug ?? m.id.slice(0, 8)
      const escudoUrl = await hospedarEscudo(m.badge, slug, null)
      if (!escudoUrl) continue
      if (!DRY_RUN) {
        await db.afiliacao.update({
          where: { id: m.id },
          data: {
            escudoUrl,
            ...(m.serie ? { serie: m.serie } : {}),
            ...(m.idTeam ? { apiExternalId: m.idTeam } : {}),
          },
        })
      }
      enviados += 1
      if (enviados % 20 === 0) console.log(`  … ${enviados} escudos`)
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
