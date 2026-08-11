/**
 * Sync seletivo de catálogo Homolog → Produção.
 *
 * Copia escudos/logos (re-upload no Cloudinary **prod**) e coords de sedes
 * por id estável. Não copia users, posts, memberships de teste.
 *
 *   TORCIDA_ENV=production \
 *   DATABASE_URL='…prod DATABASE_PUBLIC_URL…' \
 *   DATABASE_URL_HML='…hom DATABASE_PUBLIC_URL…' \
 *   CLOUDINARY_CLOUD_NAME=… CLOUDINARY_API_KEY=… CLOUDINARY_API_SECRET=… \
 *   pnpm --filter @torcida/db sync:catalogo-hml-prod
 *
 * Flags: --dry-run · --somente-escudos · --somente-logos · --somente-sedes · --somente-tenants
 */
import { PrismaClient } from '@prisma/client'
import {
  getCloudinaryConfig,
  uploadImageUrl,
  isCloudinaryUrl,
  FOLDER_ESCUDOS,
  FOLDER_LOGOS,
} from './lib/cloudinary-admin.js'
import { prepareSeedEnv } from './lib/seed-env.js'
import { TORCIDAS_BRASIL } from '../src/data/torcidas-brasil.js'

prepareSeedEnv({ requireCloudinary: true, scriptLabel: 'sync:catalogo-hml-prod' })

const DRY_RUN = process.argv.includes('--dry-run')
const ONLY_ESCUDOS = process.argv.includes('--somente-escudos')
const ONLY_LOGOS = process.argv.includes('--somente-logos')
const ONLY_SEDES = process.argv.includes('--somente-sedes')
const ONLY_TENANTS = process.argv.includes('--somente-tenants')
const ALL = !ONLY_ESCUDOS && !ONLY_LOGOS && !ONLY_SEDES && !ONLY_TENANTS

const hmlUrl = (process.env.DATABASE_URL_HML || '').trim()
if (!hmlUrl) {
  console.error('Defina DATABASE_URL_HML com a DATABASE_PUBLIC_URL do Postgres homolog.')
  process.exit(1)
}
if (hmlUrl === process.env.DATABASE_URL) {
  console.error('DATABASE_URL_HML não pode ser igual a DATABASE_URL (prod).')
  process.exit(1)
}

const dbProd = new PrismaClient()
const dbHml = new PrismaClient({ datasources: { db: { url: hmlUrl } } })

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * @param {string | null | undefined} url
 * @param {string} folder
 * @param {string} publicId
 */
async function remirror(url, folder, publicId) {
  if (!url || !isCloudinaryUrl(url)) return null
  if (DRY_RUN) return `https://res.cloudinary.com/dry-run/${folder}/${publicId}`
  return uploadImageUrl(url, { folder, publicId, overwrite: true })
}

async function syncEscudos() {
  console.log('\n=== Afiliacao.escudoUrl ===')
  /** @type {Array<{ slug: string | null, nome: string, estado: string | null, escudoUrl: string | null }>} */
  const hml = await dbHml.afiliacao.findMany({
    where: { escudoUrl: { not: null }, slug: { not: null } },
    select: { slug: true, nome: true, estado: true, escudoUrl: true },
  })
  let ok = 0
  let skip = 0
  let err = 0
  for (const row of hml) {
    if (!row.slug || !row.escudoUrl) {
      skip += 1
      continue
    }
    const prod = await dbProd.afiliacao.findUnique({
      where: { slug: row.slug },
      select: { id: true, escudoUrl: true },
    })
    if (!prod) {
      skip += 1
      continue
    }
    try {
      const escudoUrl = await remirror(row.escudoUrl, FOLDER_ESCUDOS, row.slug)
      if (!escudoUrl) {
        skip += 1
        continue
      }
      if (!DRY_RUN) {
        await dbProd.afiliacao.update({
          where: { id: prod.id },
          data: { escudoUrl },
        })
      }
      ok += 1
      if (ok % 25 === 0) console.log(`  … ${ok} escudos`)
      await sleep(120)
    } catch (e) {
      err += 1
      const msg = e instanceof Error ? e.message : String(e)
      console.warn(`  ! ${row.slug}: ${msg}`)
    }
  }
  console.log(`  escudos: ${ok} sync · ${skip} skip · ${err} erro`)
}

async function syncLogos() {
  console.log('\n=== TorcidaConhecida.logoUrl ===')
  /** @type {Array<{ slug: string, logoUrl: string | null }>} */
  const hml = await dbHml.torcidaConhecida.findMany({
    where: { logoUrl: { not: null } },
    select: { slug: true, logoUrl: true },
  })
  let ok = 0
  let skip = 0
  let err = 0
  for (const row of hml) {
    if (!row.logoUrl) {
      skip += 1
      continue
    }
    const prod = await dbProd.torcidaConhecida.findUnique({
      where: { slug: row.slug },
      select: { id: true },
    })
    if (!prod) {
      skip += 1
      continue
    }
    try {
      const logoUrl = await remirror(row.logoUrl, FOLDER_LOGOS, row.slug)
      if (!logoUrl) {
        skip += 1
        continue
      }
      if (!DRY_RUN) {
        await dbProd.torcidaConhecida.update({
          where: { id: prod.id },
          data: { logoUrl },
        })
      }
      ok += 1
      if (ok % 25 === 0) console.log(`  … ${ok} logos`)
      await sleep(120)
    } catch (e) {
      err += 1
      const msg = e instanceof Error ? e.message : String(e)
      console.warn(`  ! ${row.slug}: ${msg}`)
    }
  }
  console.log(`  logos: ${ok} sync · ${skip} skip · ${err} erro`)
}

async function syncTenantsAncoras() {
  console.log('\n=== Tenant (âncoras nacionais) logo + link ===')
  let ok = 0
  let skip = 0
  for (const tb of TORCIDAS_BRASIL) {
    const [hmlT, prodT] = await Promise.all([
      dbHml.tenant.findUnique({
        where: { slug: tb.slug },
        select: {
          logoUrl: true,
          torcidaConhecidaId: true,
          torcidaConhecida: { select: { slug: true, logoUrl: true } },
        },
      }),
      dbProd.tenant.findUnique({
        where: { slug: tb.slug },
        select: { id: true },
      }),
    ])
    if (!prodT) {
      skip += 1
      continue
    }

    let tcId = null
    let logoUrl = hmlT?.logoUrl ?? null
    if (hmlT?.torcidaConhecida?.slug) {
      const tcProd = await dbProd.torcidaConhecida.findUnique({
        where: { slug: hmlT.torcidaConhecida.slug },
        select: { id: true, logoUrl: true },
      })
      if (tcProd) {
        tcId = tcProd.id
        logoUrl = tcProd.logoUrl ?? logoUrl
      }
    }
    if (!tcId) {
      const tcProd = await dbProd.torcidaConhecida.findFirst({
        where: {
          OR: [
            { nome: { equals: tb.nome, mode: 'insensitive' } },
            { titulo: { equals: tb.nome, mode: 'insensitive' } },
          ],
        },
        select: { id: true, logoUrl: true },
      })
      if (tcProd) {
        tcId = tcProd.id
        logoUrl = tcProd.logoUrl ?? logoUrl
      }
    }

    if (!tcId && !logoUrl) {
      skip += 1
      continue
    }

    if (logoUrl && isCloudinaryUrl(logoUrl) && !logoUrl.includes(process.env.CLOUDINARY_CLOUD_NAME ?? '')) {
      try {
        logoUrl = await remirror(logoUrl, FOLDER_LOGOS, tb.slug)
      } catch {
        /* mantém logo já no prod catalog se remirror falhar */
      }
    }

    if (!DRY_RUN) {
      await dbProd.tenant.update({
        where: { id: prodT.id },
        data: {
          ...(tcId ? { torcidaConhecidaId: tcId } : {}),
          ...(logoUrl ? { logoUrl } : {}),
        },
      })
    }
    ok += 1
    console.log(`  ✓ ${tb.slug}`)
  }
  console.log(`  tenants: ${ok} sync · ${skip} skip`)
}

async function syncSedesCoords() {
  console.log('\n=== Sede lat/lng / Street View (por id) ===')
  /** @type {Array<{ id: string, lat: number | null, lng: number | null, streetViewHeading: number | null, streetViewPitch: number | null, streetViewFov: number | null }>} */
  const hml = await dbHml.sede.findMany({
    where: {
      OR: [{ lat: { not: null } }, { lng: { not: null } }],
    },
    select: {
      id: true,
      lat: true,
      lng: true,
      streetViewHeading: true,
      streetViewPitch: true,
      streetViewFov: true,
    },
  })
  let ok = 0
  let skip = 0
  for (const row of hml) {
    const prod = await dbProd.sede.findUnique({
      where: { id: row.id },
      select: { id: true },
    })
    if (!prod) {
      skip += 1
      continue
    }
    if (!DRY_RUN) {
      await dbProd.sede.update({
        where: { id: prod.id },
        data: {
          lat: row.lat,
          lng: row.lng,
          streetViewHeading: row.streetViewHeading,
          streetViewPitch: row.streetViewPitch,
          streetViewFov: row.streetViewFov,
        },
      })
    }
    ok += 1
  }
  console.log(`  sedes: ${ok} sync · ${skip} skip (id ausente em prod)`)
}

async function main() {
  if (!getCloudinaryConfig() && !DRY_RUN && (ALL || ONLY_ESCUDOS || ONLY_LOGOS || ONLY_TENANTS)) {
    console.error('CLOUDINARY_* (prod) obrigatório para remirror de imagens.')
    process.exit(1)
  }
  console.log(`sync:catalogo-hml-prod${DRY_RUN ? ' (dry-run)' : ''}`)
  console.log(`Cloudinary prod: ${process.env.CLOUDINARY_CLOUD_NAME}`)

  if (ALL || ONLY_ESCUDOS) await syncEscudos()
  if (ALL || ONLY_LOGOS) await syncLogos()
  if (ALL || ONLY_TENANTS) await syncTenantsAncoras()
  if (ALL || ONLY_SEDES) await syncSedesCoords()

  console.log('\n=== sync:catalogo-hml-prod OK ===\n')
}

main()
  .then(async () => {
    await Promise.all([dbProd.$disconnect(), dbHml.$disconnect()])
  })
  .catch(async (err) => {
    console.error(err)
    await Promise.all([dbProd.$disconnect(), dbHml.$disconnect()])
    process.exit(1)
  })
