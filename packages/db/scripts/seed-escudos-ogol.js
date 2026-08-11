/**
 * Escudos de Afiliacao via catálogo Ogol + Cloudinary.
 *
 *   pnpm --filter @torcida/db coleta:ogol-clubes          # gera ogol-clubes-brasil.json
 *   pnpm --filter @torcida/db seed:escudos-ogol -- --report-only
 *   pnpm --filter @torcida/db seed:escudos-ogol
 *   pnpm --filter @torcida/db seed:escudos-ogol -- --recheck  # rematcha inclusive quem já tem escudo
 *
 * REQUER REDE + DATABASE_URL; upload exige CLOUDINARY_*.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'
import {
  getCloudinaryConfig,
  uploadImageUrl,
  FOLDER_ESCUDOS,
  MONOREPO_ROOT,
} from './lib/cloudinary-admin.js'
import { prepareSeedEnv } from './lib/seed-env.js'
import { gerarSlugUnico } from '../src/data/afiliacoes-normalize.js'
import { scoreOgolAfiliacao } from '../src/data/escudos-ogol-match.js'

prepareSeedEnv({ requireCloudinary: true, scriptLabel: 'seed:escudos-ogol' })

const __dir = dirname(fileURLToPath(import.meta.url))
const CATALOGO_PATH = resolve(__dir, '../src/data/ogol-clubes-brasil.json')
const DRY_RUN = process.argv.includes('--dry-run')
const REPORT_ONLY = process.argv.includes('--report-only')
const RECHECK = process.argv.includes('--recheck')
const DELAY_MS = 150

const db = new PrismaClient()

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/** @returns {{ total: number, clubes: Array<{ ogolId: string, titulo: string | null, nomeOficial: string | null, cidade: string | null, uf: string | null, logoUrl: string }> }} */
function carregarCatalogo() {
  if (!existsSync(CATALOGO_PATH)) {
    throw new Error(
      `Catálogo ausente: ${CATALOGO_PATH}\nRode: pnpm --filter @torcida/db coleta:ogol-clubes`,
    )
  }
  return JSON.parse(readFileSync(CATALOGO_PATH, 'utf8'))
}

/**
 * @param {string} logoUrl
 * @param {string} slug
 * @param {{ overwrite?: boolean }} [opts]
 */
async function hospedarEscudo(logoUrl, slug, opts = {}) {
  if (!getCloudinaryConfig()) return null
  if (DRY_RUN) return `https://res.cloudinary.com/dry-run/${FOLDER_ESCUDOS}/${slug}.png`
  return uploadImageUrl(logoUrl, {
    folder: FOLDER_ESCUDOS,
    publicId: slug,
    overwrite: opts.overwrite !== false,
  })
}

async function main() {
  console.log('Escudos Ogol — casamento + Cloudinary')
  if (DRY_RUN) console.log('(dry-run)')
  if (REPORT_ONLY) console.log('(report-only)')
  if (RECHECK) console.log('(recheck: rematcha afiliações que já têm escudo)')

  const catalogo = carregarCatalogo()
  console.log(`  catálogo Ogol: ${catalogo.total ?? catalogo.clubes.length} clubes`)

  if (!getCloudinaryConfig() && !DRY_RUN && !REPORT_ONLY) {
    console.warn('⚠ CLOUDINARY_* não configurado — abortando.')
    process.exit(1)
  }

  /** @type {Array<{ id: string, nome: string, estado: string | null, cidade: string | null, slug: string | null, escudoUrl: string | null }>} */
  const alvo = await db.afiliacao.findMany({
    where: RECHECK ? {} : { escudoUrl: null },
    select: {
      id: true,
      nome: true,
      estado: true,
      cidade: true,
      slug: true,
      escudoUrl: true,
    },
    orderBy: { nome: 'asc' },
  })
  console.log(`  afiliações no escopo: ${alvo.length}${RECHECK ? ' (todas)' : ' (sem escudo)'}`)

  /** @type {Set<string>} */
  const slugsUsados = new Set(
    (await db.afiliacao.findMany({ where: { slug: { not: null } }, select: { slug: true } }))
      .map((a) => a.slug)
      .filter(Boolean),
  )

  /** @type {Array<{ score: number, afiliacaoId: string, nome: string, estado: string | null, ogolNome: string, ogolId: string, logoUrl: string, slug: string, escudoUrlAtual: string | null }>} */
  const candidatos = []

  for (const af of alvo) {
    for (const ogol of catalogo.clubes) {
      const score = scoreOgolAfiliacao(ogol, af)
      if (score < 90) continue
      const slug = af.slug ?? gerarSlugUnico(af.nome, af.estado ?? '', slugsUsados)
      candidatos.push({
        score,
        afiliacaoId: af.id,
        nome: af.nome,
        estado: af.estado,
        ogolNome: ogol.nomeOficial || ogol.titulo || ogol.slug,
        ogolId: ogol.ogolId,
        logoUrl: ogol.logoUrl,
        slug,
        escudoUrlAtual: af.escudoUrl,
      })
    }
  }

  // Preferir score maior; em empate, preferir quem tem cidade no Ogol (já filtrada no score).
  candidatos.sort((a, b) => b.score - a.score)

  /** @type {typeof candidatos} */
  const mapeados = []
  /** @type {Set<string>} */
  const afUsados = new Set()
  /** @type {Set<string>} */
  const ogolUsados = new Set()
  /** @type {string[]} */
  const semMatch = []

  for (const c of candidatos) {
    if (afUsados.has(c.afiliacaoId) || ogolUsados.has(c.ogolId)) continue
    afUsados.add(c.afiliacaoId)
    ogolUsados.add(c.ogolId)
    mapeados.push(c)
  }

  for (const af of alvo) {
    if (!afUsados.has(af.id)) semMatch.push(`${af.nome} (${af.estado ?? '?'})`)
  }

  const reportPath = resolve(MONOREPO_ROOT, 'packages/db/src/data/escudos-ogol-report.json')
  const report = {
    geradoEm: new Date().toISOString(),
    recheck: RECHECK,
    ogolTotal: catalogo.clubes.length,
    escopoAntes: alvo.length,
    mapeados: mapeados.length,
    semMatch: semMatch.length,
    pares: mapeados.map((m) => ({
      clube: m.nome,
      uf: m.estado,
      ogol: m.ogolNome,
      ogolId: m.ogolId,
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
  let sobrescritos = 0
  let erros = 0
  for (const m of mapeados) {
    try {
      const precisaUpload = RECHECK || !m.escudoUrlAtual
      if (!precisaUpload) continue

      const escudoUrl = await hospedarEscudo(m.logoUrl, m.slug, { overwrite: true })
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
      if (m.escudoUrlAtual) {
        sobrescritos += 1
        console.log(`  ↻ ${m.nome} → ${m.ogolNome} (${m.ogolId})`)
      }
      if (enviados % 25 === 0) console.log(`  … ${enviados} escudos`)
      await sleep(DELAY_MS)
    } catch (err) {
      erros += 1
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`  ! ${m.nome}: ${msg}`)
    }
  }

  const restantes = DRY_RUN
    ? alvo.filter((a) => !a.escudoUrl && !afUsados.has(a.id)).length
    : await db.afiliacao.count({ where: { escudoUrl: null } })

  console.log('\nResumo:')
  console.log(`  escudos enviados : ${enviados}`)
  console.log(`  sobrescritos     : ${sobrescritos}`)
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
