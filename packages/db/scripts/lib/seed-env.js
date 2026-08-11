/**
 * Alvo de ambiente para seeds/repairs locais.
 *
 * Torcida SaaS: Railway Variables isolam prod/hom no deploy; no laptop os
 * scripts leem process.env + .env*. Esta lib evita misturar Cloudinary/DB
 * de um ambiente com outro.
 *
 * Uso:
 *   import { prepareSeedEnv, assertNotProductionSeed } from './lib/seed-env.js'
 *   const { alvo } = prepareSeedEnv({ requireCloudinary: true })
 *
 * Obrigatório no shell:
 *   TORCIDA_ENV=production|homolog|local
 */
import { loadEnvFiles } from './cloudinary-admin.js'

/** @typedef {'production' | 'homolog' | 'local'} TorcidaEnvAlvo */

const ALVOS = new Set(['production', 'homolog', 'local'])

/**
 * @returns {TorcidaEnvAlvo}
 */
export function lerTorcidaEnv() {
  const raw = (process.env.TORCIDA_ENV || '').trim().toLowerCase()
  if (!ALVOS.has(raw)) {
    throw new Error(
      'Defina TORCIDA_ENV=production|homolog|local antes do seed.\n' +
        '  production → Postgres prod (DATABASE_PUBLIC_URL) + CLOUDINARY_* da conta prod (export no shell)\n' +
        '  homolog    → banco/Cloudinary de HML\n' +
        '  local      → Postgres localhost / dev',
    )
  }
  return /** @type {TorcidaEnvAlvo} */ (raw)
}

/**
 * @param {string | undefined} url
 */
function classificarDatabaseUrl(url) {
  if (!url) return 'ausente'
  const u = url.toLowerCase()
  if (u.includes('localhost') || u.includes('127.0.0.1')) return 'local'
  if (u.includes('railway.internal')) return 'railway-internal'
  if (u.includes('proxy.rlwy.net') || u.includes('railway.app') || u.includes('rlwy.net')) {
    return 'railway-public'
  }
  return 'outro'
}

/**
 * Snapshot do shell → loadEnvFiles (não sobrescreve) → validações por alvo.
 *
 * Em **production**: CLOUDINARY_* e DATABASE_URL precisam ter vindo do shell
 * (export), não só do .env.local de hom/dev. DATABASE_URL não pode ser
 * localhost nem *.railway.internal (use DATABASE_PUBLIC_URL no laptop).
 *
 * @param {{ requireCloudinary?: boolean, scriptLabel?: string }} [opts]
 */
export function prepareSeedEnv(opts = {}) {
  const requireCloudinary = opts.requireCloudinary === true
  const label = opts.scriptLabel ? ` [${opts.scriptLabel}]` : ''

  const alvo = lerTorcidaEnv()

  const shellDb = process.env.DATABASE_URL
  const shellCloudName = process.env.CLOUDINARY_CLOUD_NAME
  const shellCloudKey = process.env.CLOUDINARY_API_KEY
  const shellCloudSecret = process.env.CLOUDINARY_API_SECRET
  const shellTenantSlug = process.env.TENANT_SLUG

  loadEnvFiles()

  const dbUrl = process.env.DATABASE_URL
  const dbKind = classificarDatabaseUrl(dbUrl)

  console.log(`TORCIDA_ENV=${alvo}${label} · DATABASE_URL=${dbKind}`)

  if (alvo === 'production') {
    if (!shellDb?.trim()) {
      throw new Error(
        'production: exporte DATABASE_URL no shell com a DATABASE_PUBLIC_URL do Postgres prod ' +
          '(não confie só no .env.local).',
      )
    }
    if (dbKind === 'local') {
      throw new Error('production: DATABASE_URL aponta para localhost — recusado.')
    }
    if (dbKind === 'railway-internal') {
      throw new Error(
        'production: DATABASE_URL usa postgres.railway.internal — isso só funciona dentro do Railway.\n' +
          'No laptop use a DATABASE_PUBLIC_URL (host *.proxy.rlwy.net).',
      )
    }
    // Em prod, TENANT_SLUG do .env.local (dev single-tenant) não deve limitar
    // seeds de catálogo. Só respeita slug se veio não-vazio do shell.
    if (shellTenantSlug?.trim()) {
      process.env.TENANT_SLUG = shellTenantSlug.trim()
      console.log(`TENANT_SLUG (shell): ${process.env.TENANT_SLUG}`)
    } else {
      delete process.env.TENANT_SLUG
    }
    if (requireCloudinary) {
      if (!shellCloudName?.trim() || !shellCloudKey?.trim() || !shellCloudSecret?.trim()) {
        throw new Error(
          'production: exporte CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY e CLOUDINARY_API_SECRET ' +
            'no shell (conta prod). Sem isso o seed pode pegar o Cloudinary do .env.local (hom).',
        )
      }
      // Garante que o shell vence mesmo se algo tiver preenchido depois.
      process.env.CLOUDINARY_CLOUD_NAME = shellCloudName
      process.env.CLOUDINARY_API_KEY = shellCloudKey
      process.env.CLOUDINARY_API_SECRET = shellCloudSecret
      console.log(`Cloudinary (shell/prod): cloud_name=${shellCloudName}`)
    }
  }

  if (alvo === 'homolog' && dbKind === 'local') {
    console.warn('⚠ homolog com DATABASE_URL local — confira se era isso mesmo.')
  }

  if (alvo === 'local' && dbKind === 'railway-public') {
    console.warn('⚠ local com DATABASE_URL Railway público — risco de gravar fora do PC.')
  }

  return { alvo, dbKind }
}

/** Bloqueia lotes de teste quando TORCIDA_ENV=production. */
export function assertNotProductionSeed(scriptName = 'seed-teste') {
  const raw = (process.env.TORCIDA_ENV || '').trim().toLowerCase()
  if (raw === 'production') {
    throw new Error(
      `${scriptName}: recusado com TORCIDA_ENV=production.\n` +
        'Lotes de teste (corinthians/nacional/jornadas/convites) não rodam em prod.',
    )
  }
  loadEnvFiles()
}
