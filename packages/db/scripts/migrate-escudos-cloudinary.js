/**
 * Migra escudos de clubes (Afiliacao) de /public/escudos para Cloudinary.
 *
 *   pnpm --filter @torcida/db seed:migrate-escudos-cloudinary
 *   pnpm --filter @torcida/db seed:migrate-escudos-cloudinary -- --dry-run
 *
 * Requer CLOUDINARY_* e DATABASE_URL.
 *
 * Fases (idempotente):
 *  1. Upload de arquivos locais ou URLs http para Cloudinary
 *  2. Sincroniza duplicatas (mesmo clube+UF) copiando URL Cloudinary do par
 *  3. Zera escudoUrl local órfão (sem arquivo nem par no Cloudinary)
 *
 * Se a fase 1 não encontrar arquivos locais, rode antes:
 *   pnpm --filter @torcida/db seed:afiliacoes
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, basename } from 'node:path'
import { PrismaClient } from '@prisma/client'
import { normalizeNome } from '../src/data/afiliacoes-normalize.js'
import {
  loadEnvFiles,
  getCloudinaryConfig,
  uploadImageBuffer,
  uploadImageUrl,
  isLocalAssetUrl,
  isCloudinaryUrl,
  FOLDER_ESCUDOS,
  MONOREPO_ROOT,
} from './lib/cloudinary-admin.js'

loadEnvFiles()

const DRY_RUN = process.argv.includes('--dry-run')
const ESCUDOS_DIR = resolve(MONOREPO_ROOT, 'apps/web/public/escudos')
const db = new PrismaClient()

/** @typedef {{ id: string, slug: string | null, nome: string, estado: string | null, escudoUrl: string | null }} AfiliacaoEscudo */

/** @param {string} nome @param {string | null} estado */
function chaveClube(nome, estado) {
  return `${normalizeNome(nome)}|${normalizeNome(estado ?? '')}`
}

/** @param {AfiliacaoEscudo[]} afiliacoes */
function buildCloudinaryPorClube(afiliacoes) {
  /** @type {Map<string, string>} */
  const map = new Map()
  for (const a of afiliacoes) {
    if (!a.escudoUrl || !isCloudinaryUrl(a.escudoUrl)) continue
    const k = chaveClube(a.nome, a.estado)
    if (!map.has(k)) map.set(k, a.escudoUrl)
  }
  return map
}

/** @param {string | null} escudoUrl */
function localEscudoPath(escudoUrl) {
  if (!escudoUrl || !escudoUrl.startsWith('/escudos/')) return null
  const nome = basename(escudoUrl)
  const path = resolve(ESCUDOS_DIR, nome)
  return existsSync(path) ? path : null
}

/**
 * @param {AfiliacaoEscudo} afiliacao
 * @param {Map<string, string>} cloudinaryPorClube
 */
async function migrarAfiliacao(afiliacao, cloudinaryPorClube) {
  const { id, slug, nome, estado, escudoUrl } = afiliacao
  if (!escudoUrl) return { status: 'skip', reason: 'sem url' }
  if (isCloudinaryUrl(escudoUrl)) return { status: 'skip', reason: 'já no cloudinary' }
  if (!isLocalAssetUrl(escudoUrl)) return { status: 'skip', reason: 'url externa' }

  const publicId = slug ?? basename(escudoUrl, '.png')
  const localPath = localEscudoPath(escudoUrl)

  if (DRY_RUN) {
    const via = localPath ? 'upload' : cloudinaryPorClube.get(chaveClube(nome, estado)) ? 'par' : '?'
    console.log(`  (dry-run) ${nome} → ${publicId} (${via})`)
    return { status: 'dry-run' }
  }

  if (!localPath && escudoUrl.startsWith('/escudos/')) {
    const par = cloudinaryPorClube.get(chaveClube(nome, estado))
    if (par) {
      await db.afiliacao.update({ where: { id }, data: { escudoUrl: par } })
      console.log(`  ≈ ${nome} → par Cloudinary (${slug})`)
      return { status: 'synced' }
    }
    console.warn(`  ! ${nome}: arquivo local ausente (${escudoUrl}) — rode seed:afiliacoes`)
    return { status: 'fail', reason: 'arquivo ausente' }
  }

  let secureUrl
  if (localPath) {
    const buf = readFileSync(localPath)
    secureUrl = await uploadImageBuffer(buf, { folder: FOLDER_ESCUDOS, publicId })
  } else if (escudoUrl.startsWith('http')) {
    secureUrl = await uploadImageUrl(escudoUrl, { folder: FOLDER_ESCUDOS, publicId })
  } else {
    return { status: 'fail', reason: 'origem desconhecida' }
  }

  await db.afiliacao.update({
    where: { id },
    data: { escudoUrl: secureUrl },
  })
  console.log(`  ✓ ${nome} → ${secureUrl}`)
  return { status: 'ok', url: secureUrl }
}

/**
 * Segunda passada: duplicatas com /escudos/ cujo par já está no Cloudinary.
 * @param {AfiliacaoEscudo[]} afiliacoes
 */
async function reconciliarDuplicatas(afiliacoes) {
  const cloudinaryPorClube = buildCloudinaryPorClube(afiliacoes)
  const stats = { synced: 0, nulled: 0, skip: 0 }

  for (const a of afiliacoes) {
    if (!a.escudoUrl?.startsWith('/escudos/')) {
      stats.skip += 1
      continue
    }
    const par = cloudinaryPorClube.get(chaveClube(a.nome, a.estado))
    if (DRY_RUN) {
      console.log(`  (dry-run) reconciliar ${a.nome} (${a.slug}) → ${par ? 'par' : 'null'}`)
      if (par) stats.synced += 1
      else stats.nulled += 1
      continue
    }
    if (par) {
      await db.afiliacao.update({ where: { id: a.id }, data: { escudoUrl: par } })
      console.log(`  ≈ ${a.nome} (${a.slug}) → par Cloudinary`)
      stats.synced += 1
    } else {
      await db.afiliacao.update({ where: { id: a.id }, data: { escudoUrl: null } })
      console.warn(`  · ${a.nome} (${a.slug}): escudo local órfão → null`)
      stats.nulled += 1
    }
  }
  return stats
}

/** @returns {Promise<AfiliacaoEscudo[]>} */
async function listarAfiliacoes() {
  return db.afiliacao.findMany({
    select: { id: true, slug: true, nome: true, estado: true, escudoUrl: true },
    orderBy: { nome: 'asc' },
  })
}

async function main() {
  const config = getCloudinaryConfig()
  if (!config) {
    console.error('Configure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY e CLOUDINARY_API_SECRET.')
    process.exit(1)
  }

  console.log(`Migração de escudos → Cloudinary (${config.cloudName})`)
  if (DRY_RUN) console.log('(dry-run: sem upload nem gravação)')

  let afiliacoes = await listarAfiliacoes()
  const cloudinaryPorClube = buildCloudinaryPorClube(afiliacoes)

  console.log('\nFase 1 — upload / sync imediato por par')
  const stats = { ok: 0, synced: 0, skip: 0, fail: 0, dry: 0 }
  for (const a of afiliacoes) {
    const r = await migrarAfiliacao(a, cloudinaryPorClube)
    if (r.status === 'ok') {
      stats.ok += 1
      if (r.url) cloudinaryPorClube.set(chaveClube(a.nome, a.estado), r.url)
    } else if (r.status === 'synced') stats.synced += 1
    else if (r.status === 'dry-run') stats.dry += 1
    else if (r.status === 'fail') stats.fail += 1
    else stats.skip += 1
  }

  afiliacoes = await listarAfiliacoes()
  const restantes = afiliacoes.filter((a) => a.escudoUrl?.startsWith('/escudos/'))
  if (restantes.length > 0) {
    console.log(`\nFase 2 — reconciliar duplicatas (${restantes.length} locais restantes)`)
    const rec = await reconciliarDuplicatas(afiliacoes)
    stats.synced += rec.synced
    stats.fail = Math.max(0, stats.fail - rec.synced - rec.nulled)
    if (rec.nulled > 0) console.log(`  órfãos zerados: ${rec.nulled}`)
  }

  const local = afiliacoes.filter((a) => a.escudoUrl?.startsWith('/escudos/')).length
  const cloud = (await listarAfiliacoes()).filter((a) => isCloudinaryUrl(a.escudoUrl)).length

  console.log('\nResumo:')
  console.log(`  uploads   : ${stats.ok}`)
  console.log(`  sync par  : ${stats.synced}`)
  console.log(`  ignorados : ${stats.skip}`)
  console.log(`  falhas    : ${stats.fail}`)
  console.log(`  cloudinary: ${cloud} registros | locais: ${local}`)
  if (DRY_RUN) console.log(`  dry-run   : ${stats.dry}`)
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
