import 'server-only'
import crypto from 'node:crypto'

export interface CloudinaryConfig {
  cloudName: string
  apiKey: string
  apiSecret: string
}

/** Lê as credenciais do Cloudinary do ambiente. `null` quando não configurado. */
export function getCloudinaryConfig(): CloudinaryConfig | null {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME
  const apiKey = process.env.CLOUDINARY_API_KEY
  const apiSecret = process.env.CLOUDINARY_API_SECRET
  if (!cloudName || !apiKey || !apiSecret) return null
  return { cloudName, apiKey, apiSecret }
}

/** Assina os parâmetros de upload conforme o esquema do Cloudinary (SHA-1). */
export function signCloudinaryParams(
  params: Record<string, string | number>,
  apiSecret: string,
): string {
  const toSign = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&')
  return crypto.createHash('sha1').update(`${toSign}${apiSecret}`).digest('hex')
}
