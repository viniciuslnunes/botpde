/**
 * Upload administrativo para Cloudinary (seeds e migrações).
 * Requer CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY e CLOUDINARY_API_SECRET.
 */
import crypto from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = dirname(fileURLToPath(import.meta.url))

/** Raiz do monorepo (packages/db/scripts/lib → ../../../../). */
export const MONOREPO_ROOT = resolve(__dir, '../../../..')

export const FOLDER_ESCUDOS = 'torcida/catalogo/escudos'
export const FOLDER_LOGOS = 'torcida/catalogo/logos'

/** Carrega .env do monorepo sem sobrescrever variáveis já definidas. */
export function loadEnvFiles() {
  for (const rel of ['packages/db/.env', 'apps/web/.env.local', 'apps/web/.env', '.env']) {
    const path = resolve(MONOREPO_ROOT, rel)
    if (!existsSync(path)) continue
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const eq = t.indexOf('=')
      if (eq === -1) continue
      const key = t.slice(0, eq).trim()
      let val = t.slice(eq + 1).trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      // Só preenche se a chave ainda não existir no process.env.
      // `export FOO=` (string vazia) conta como definida — não sobrescrever
      // com .env.local (ex.: TENANT_SLUG=pde-gavioes-fiel).
      if (!Object.hasOwn(process.env, key)) process.env[key] = val
    }
  }
}

/** @returns {{ cloudName: string, apiKey: string, apiSecret: string } | null} */
export function getCloudinaryConfig() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME
  const apiKey = process.env.CLOUDINARY_API_KEY
  const apiSecret = process.env.CLOUDINARY_API_SECRET
  if (!cloudName || !apiKey || !apiSecret) return null
  return { cloudName, apiKey, apiSecret }
}

/** @param {Record<string, string | number>} params */
export function signCloudinaryParams(params, apiSecret) {
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&')
  return crypto.createHash('sha1').update(`${toSign}${apiSecret}`).digest('hex')
}

/**
 * @param {string} file — URL remota ou data URI (base64)
 * @param {{ folder: string, publicId: string, overwrite?: boolean }} opts
 * @returns {Promise<string>} secure_url
 */
async function uploadImageFile(file, { folder, publicId, overwrite = true }) {
  const config = getCloudinaryConfig()
  if (!config) throw new Error('Cloudinary não configurado (CLOUDINARY_*)')

  const timestamp = Math.round(Date.now() / 1000)
  const params = {
    folder,
    public_id: publicId,
    timestamp,
    overwrite: overwrite ? 'true' : 'false',
  }
  const signature = signCloudinaryParams(params, config.apiSecret)

  const body = new URLSearchParams()
  body.set('file', file)
  body.set('api_key', config.apiKey)
  body.set('timestamp', String(timestamp))
  body.set('signature', signature)
  body.set('folder', folder)
  body.set('public_id', publicId)
  body.set('overwrite', overwrite ? 'true' : 'false')

  const res = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`, {
    method: 'POST',
    body,
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Cloudinary upload failed (${publicId}): ${err}`)
  }
  const data = await res.json()
  return data.secure_url
}

/** @param {string} imageUrl */
export async function uploadImageUrl(imageUrl, { folder, publicId, overwrite = true }) {
  return uploadImageFile(imageUrl, { folder, publicId, overwrite })
}

/** @param {Buffer} buffer */
export async function uploadImageBuffer(buffer, { folder, publicId, mime = 'image/png', overwrite = true }) {
  const dataUri = `data:${mime};base64,${buffer.toString('base64')}`
  return uploadImageFile(dataUri, { folder, publicId, overwrite })
}

/** @param {string | null | undefined} url */
export function isLocalAssetUrl(url) {
  return typeof url === 'string' && url.startsWith('/')
}

/** @param {string | null | undefined} url */
export function isCloudinaryUrl(url) {
  return typeof url === 'string' && url.includes('res.cloudinary.com')
}
