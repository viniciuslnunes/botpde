/**
 * Copia **só** PDE FIEL BAIXADA (foto + endereço + lat/lng/Street View)
 * de Homolog → Produção. Não percorre outras unidades.
 *
 * Em HML a sede é UUID Caso B; em prod usamos o id estável `pde-fiel-baixada`
 * (irmão da Subsede Baixada, sob a Sede Gaviões).
 *
 *   TORCIDA_ENV=production \
 *   DATABASE_URL='…prod…' \
 *   DATABASE_URL_HML='…hom…' \
 *   CLOUDINARY_CLOUD_NAME=… CLOUDINARY_API_KEY=… CLOUDINARY_API_SECRET=… \
 *   pnpm --filter @torcida/db sync:pde-fiel-baixada-hml-prod
 *
 * Flag: --dry-run
 */
import { PrismaClient } from '@prisma/client'
import {
  getCloudinaryConfig,
  uploadImageUrl,
  isCloudinaryUrl,
} from './lib/cloudinary-admin.js'
import { prepareSeedEnv } from './lib/seed-env.js'

prepareSeedEnv({ requireCloudinary: true, scriptLabel: 'sync:pde-fiel-baixada-hml-prod' })

const DRY_RUN = process.argv.includes('--dry-run')

/** Par explícito — não há loop de catálogo. */
const PROD_ID = 'pde-fiel-baixada'
const HML_ID = 'c8bc370f-2067-4de3-adc4-b012931e857d'
const FOLDER_SEDES = 'torcida/catalogo/sedes'

const hmlUrl = (process.env.DATABASE_URL_HML || '').trim()
if (!hmlUrl) {
  console.error('Defina DATABASE_URL_HML (DATABASE_PUBLIC_URL do Postgres homolog).')
  process.exit(1)
}
if (hmlUrl === process.env.DATABASE_URL) {
  console.error('DATABASE_URL_HML não pode ser igual a DATABASE_URL (prod).')
  process.exit(1)
}

const dbProd = new PrismaClient()
const dbHml = new PrismaClient({ datasources: { db: { url: hmlUrl } } })

async function main() {
  if (!getCloudinaryConfig() && !DRY_RUN) {
    console.error('CLOUDINARY_* (prod) obrigatório para remirror da foto.')
    process.exit(1)
  }

  const hml = await dbHml.sede.findUnique({
    where: { id: HML_ID },
    select: {
      id: true,
      nome: true,
      endereco: true,
      cidade: true,
      estado: true,
      fotoUrl: true,
      lat: true,
      lng: true,
      streetViewHeading: true,
      streetViewPitch: true,
      streetViewFov: true,
    },
  })
  if (!hml) {
    console.error(`HML: sede ${HML_ID} não encontrada.`)
    process.exit(1)
  }

  const prod = await dbProd.sede.findUnique({
    where: { id: PROD_ID },
    select: { id: true, nome: true, tenant: { select: { slug: true } } },
  })
  if (!prod) {
    console.error(
      `Prod: sede ${PROD_ID} não encontrada — rode seed:sedes-onboarding antes.`,
    )
    process.exit(1)
  }

  let fotoUrl = null
  if (hml.fotoUrl && isCloudinaryUrl(hml.fotoUrl)) {
    if (DRY_RUN) {
      fotoUrl = `https://res.cloudinary.com/dry-run/${FOLDER_SEDES}/${PROD_ID}`
    } else {
      fotoUrl = await uploadImageUrl(hml.fotoUrl, {
        folder: FOLDER_SEDES,
        publicId: PROD_ID,
        overwrite: true,
      })
    }
  }

  const data = {
    endereco: hml.endereco,
    cidade: hml.cidade,
    estado: hml.estado,
    lat: hml.lat,
    lng: hml.lng,
    streetViewHeading: hml.streetViewHeading,
    streetViewPitch: hml.streetViewPitch,
    streetViewFov: hml.streetViewFov,
    ...(fotoUrl ? { fotoUrl } : {}),
  }

  console.log(
    `sync PDE FIEL BAIXADA${DRY_RUN ? ' (dry-run)' : ''}: HML ${hml.id} → prod ${prod.id} (${prod.tenant.slug})`,
  )
  console.log(
    JSON.stringify(
      {
        de: {
          nome: hml.nome,
          endereco: hml.endereco,
          cidade: hml.cidade,
          lat: hml.lat,
          lng: hml.lng,
          foto: Boolean(hml.fotoUrl),
        },
        para: data,
      },
      null,
      2,
    ),
  )

  if (!DRY_RUN) {
    await dbProd.sede.update({ where: { id: PROD_ID }, data })
  }
  console.log('OK')
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
