/**
 * Seed nacional de clubes (Afiliacao) + escudos.
 *
 * Popula `Afiliacao` a partir do dataset curado
 * (`src/data/afiliacoes-brasil.js`, extraído de `docs/knowledge/diretorio-nacional.md`).
 * Enriquece série + escudo casando cada clube com a TheSportsDB (4 ligas),
 * hospeda o escudo no Cloudinary (`torcida/catalogo/escudos/<slug>`) e grava a URL no banco.
 *
 * REQUER REDE — roda na máquina do usuário, não no sandbox de CI:
 *   pnpm --filter @torcida/db seed:afiliacoes
 *   pnpm --filter @torcida/db seed:afiliacoes -- --dry-run   (não grava/upload)
 *
 * Idempotente: upsert por slug; re-execução não duplica.
 * Degradação graciosa: clube sem match na API → escudoUrl null, serie null.
 * Sem CLOUDINARY_*: escudos não são gravados (fallback visual no onboarding).
 *
 * COBERTURA x CHAVE DE API: a chave de teste pública "3" retorna apenas ~10
 * times por liga (Série D vazia) → ~30 times, casando ~25 clubes. Para cobertura
 * plena (Séries A–D completas, ~80+ clubes) exporte uma chave de patrono em
 * `THESPORTSDB_KEY` antes de rodar.
 */
import { PrismaClient } from '@prisma/client'
import { AFILIACOES_BRASIL } from '../src/data/afiliacoes-brasil.js'
import {
  LIGAS,
  indexarLiga,
  casarClube,
  gerarSlugUnico,
  normalizeNome,
} from '../src/data/afiliacoes-normalize.js'
import {
  loadEnvFiles,
  getCloudinaryConfig,
  uploadImageUrl,
  isCloudinaryUrl,
  FOLDER_ESCUDOS,
} from './lib/cloudinary-admin.js'

loadEnvFiles()

const API_KEY = process.env.THESPORTSDB_KEY || '3'
const API_BASE = `https://www.thesportsdb.com/api/v1/json/${API_KEY}/search_all_teams.php`

const DRY_RUN = process.argv.includes('--dry-run')

/** @param {string | null | undefined} url */
function escudoCloudinaryExistente(url) {
  return url && isCloudinaryUrl(url) ? url : null
}

/** @param {string} url */
async function fetchJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`)
  return res.json()
}

/**
 * Envia escudo remoto ao Cloudinary. Retorna secure_url ou null.
 * @param {string} badgeUrl
 * @param {string} slug
 * @param {string | null} escudoExistente — mantém URL Cloudinary já gravada
 * @returns {Promise<string|null>}
 */
async function hospedarEscudo(badgeUrl, slug, escudoExistente) {
  if (escudoExistente) return escudoExistente
  if (!getCloudinaryConfig()) return null
  if (DRY_RUN) return `https://res.cloudinary.com/dry-run/${FOLDER_ESCUDOS}/${slug}.png`
  try {
    return await uploadImageUrl(badgeUrl, { folder: FOLDER_ESCUDOS, publicId: slug })
  } catch (err) {
    console.warn(`  ! falha Cloudinary (${slug}): ${err.message}`)
    return null
  }
}

async function main() {
  console.log(`Seed de afiliações — ${AFILIACOES_BRASIL.length} clubes no dataset.`)
  if (DRY_RUN) console.log('(dry-run: sem gravação no banco nem upload real)')
  if (!getCloudinaryConfig()) {
    console.warn('⚠ CLOUDINARY_* não configurado — escudos não serão enviados (escudoUrl null).')
  }

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

  /** @type {Set<string>} */
  const usados = new Set()
  /** @type {Map<string, string>} */
  const slugPorClube = new Map()
  /** @type {Map<string, string | null>} */
  const escudoPorSlug = new Map()
  if (!DRY_RUN) {
    /** @type {{slug: string|null, nome: string, estado: string|null, escudoUrl: string|null, _count: {tenants: number}}[]} */
    const existentes = await db.afiliacao.findMany({
      select: {
        slug: true,
        nome: true,
        estado: true,
        escudoUrl: true,
        _count: { select: { tenants: true } },
      },
      orderBy: { criadoEm: 'desc' },
    })
    for (const a of existentes) {
      if (!a.slug) continue
      usados.add(a.slug)
      escudoPorSlug.set(a.slug, a.escudoUrl)
      const chave = `${normalizeNome(a.nome)}|${normalizeNome(a.estado ?? '')}`
      const atual = slugPorClube.get(chave)
      if (!atual || a._count.tenants > 0) slugPorClube.set(chave, a.slug)
    }
  }

  let comEscudo = 0
  let casados = 0
  for (const clube of AFILIACOES_BRASIL) {
    const chaveClube = `${normalizeNome(clube.nome)}|${normalizeNome(clube.estado)}`
    const slug = slugPorClube.get(chaveClube)
      ?? gerarSlugUnico(clube.nome, clube.estado, usados)
    slugPorClube.set(chaveClube, slug)
    const match = casarClube(clube, indice)
    /** @type {string | null} */
    let escudoUrl = escudoCloudinaryExistente(escudoPorSlug.get(slug))
    /** @type {string|null} */
    let serie = null

    if (match) {
      casados += 1
      serie = match.serie
      if (match.badge) {
        const hospedado = await hospedarEscudo(match.badge, slug, escudoUrl)
        if (hospedado) {
          escudoUrl = hospedado
          comEscudo += 1
        }
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
    escudoPorSlug.set(slug, escudoUrl)
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
