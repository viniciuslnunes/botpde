/**
 * Seed nacional de clubes (Afiliacao) + escudos.
 *
 * Popula `Afiliacao` a partir do dataset curado
 * (`src/data/afiliacoes-brasil.js`, extraído de `docs/knowledge/diretorio-nacional.md`).
 * Enriquece série + escudo casando cada clube com a TheSportsDB (4 ligas),
 * baixa o escudo para `apps/web/public/escudos/<slug>.png` e versiona.
 *
 * REQUER REDE — roda na máquina do usuário, não no sandbox de CI:
 *   pnpm --filter @torcida/db seed:afiliacoes
 *   pnpm --filter @torcida/db seed:afiliacoes -- --dry-run   (não grava/baixa)
 *
 * Idempotente: upsert por slug; re-execução não duplica.
 * Degradação graciosa: clube sem match na API → escudoUrl null, serie null.
 *
 * COBERTURA x CHAVE DE API: a chave de teste pública "3" retorna apenas ~10
 * times por liga (Série D vazia) → ~30 times, casando ~25 clubes. Para cobertura
 * plena (Séries A–D completas, ~80+ clubes) exporte uma chave de patrono em
 * `THESPORTSDB_KEY` antes de rodar.
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'
import { AFILIACOES_BRASIL } from '../src/data/afiliacoes-brasil.js'
import {
  LIGAS,
  indexarLiga,
  casarClube,
  gerarSlugUnico,
} from '../src/data/afiliacoes-normalize.js'

const __dir = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dir, '../..')
const ESCUDOS_DIR = resolve(root, 'apps/web/public/escudos')
const API_KEY = process.env.THESPORTSDB_KEY || '3'
const API_BASE = `https://www.thesportsdb.com/api/v1/json/${API_KEY}/search_all_teams.php`

const DRY_RUN = process.argv.includes('--dry-run')

/** @param {string} url */
async function fetchJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`)
  return res.json()
}

/**
 * Baixa o escudo e grava em disco. Retorna o caminho público ou null.
 * @param {string} badgeUrl
 * @param {string} slug
 * @returns {Promise<string|null>}
 */
async function baixarEscudo(badgeUrl, slug) {
  const destino = resolve(ESCUDOS_DIR, `${slug}.png`)
  const publicPath = `/escudos/${slug}.png`
  if (existsSync(destino)) return publicPath // idempotente: já baixado
  if (DRY_RUN) return publicPath
  const res = await fetch(badgeUrl)
  if (!res.ok) {
    console.warn(`  ! falha ao baixar escudo (${res.status}): ${badgeUrl}`)
    return null
  }
  const buf = Buffer.from(await res.arrayBuffer())
  writeFileSync(destino, buf)
  return publicPath
}

async function main() {
  console.log(`Seed de afiliações — ${AFILIACOES_BRASIL.length} clubes no dataset.`)
  if (DRY_RUN) console.log('(dry-run: sem gravação no banco nem download real)')

  // 1) Índice normalizado das 4 ligas.
  /** @type {Map<string, {nome:string,badge:string|null,serie:string,location:string|null}>} */
  const indice = new Map()
  for (const { liga, serie } of LIGAS) {
    try {
      const payload = await fetchJson(`${API_BASE}?l=${liga}`)
      indexarLiga(payload, serie, indice)
      console.log(`  API ${liga}: ${payload?.teams?.length ?? 0} times.`)
    } catch (err) {
      console.warn(`  ! falha ao buscar ${liga}: ${err.message}`)
    }
  }

  if (!DRY_RUN) mkdirSync(ESCUDOS_DIR, { recursive: true })

  // 2) Slugs já existentes na base (unicidade global do @unique).
  /** @type {Set<string>} */
  const usados = new Set()
  if (!DRY_RUN) {
    /** @type {{slug: string|null}[]} */
    const existentes = await db.afiliacao.findMany({ select: { slug: true } })
    for (const a of existentes) if (a.slug) usados.add(a.slug)
  }

  // 3) Upsert por slug.
  let comEscudo = 0
  let casados = 0
  for (const clube of AFILIACOES_BRASIL) {
    const slug = gerarSlugUnico(clube.nome, clube.estado, usados)
    const match = casarClube(clube, indice)
    let escudoUrl = null
    /** @type {string|null} */
    let serie = null

    if (match) {
      casados += 1
      serie = match.serie
      if (match.badge) {
        escudoUrl = await baixarEscudo(match.badge, slug)
        if (escudoUrl) comEscudo += 1
      }
    }

    if (DRY_RUN) {
      console.log(
        `  ${match ? '✓' : '·'} ${clube.nome} (${clube.estado}) → slug=${slug}` +
          ` serie=${serie ?? '—'} escudo=${escudoUrl ? 'sim' : 'não'}`,
      )
      continue
    }

    await db.afiliacao.upsert({
      where: { slug },
      create: {
        nome: clube.nome,
        apelido: clube.apelido ?? null,
        cidade: clube.cidade ?? null,
        estado: clube.estado ?? null,
        slug,
        serie,
        escudoUrl,
      },
      update: {
        nome: clube.nome,
        apelido: clube.apelido ?? null,
        cidade: clube.cidade ?? null,
        estado: clube.estado ?? null,
        serie,
        escudoUrl,
      },
    })
  }

  console.log('\nResumo:')
  console.log(`  clubes casados na API : ${casados}/${AFILIACOES_BRASIL.length}`)
  console.log(`  clubes com escudo     : ${comEscudo}/${AFILIACOES_BRASIL.length}`)
}

const db = new PrismaClient()

main()
  .then(async () => {
    await db.$disconnect()
  })
  .catch(async (err) => {
    console.error(err)
    await db.$disconnect()
    process.exit(1)
  })
