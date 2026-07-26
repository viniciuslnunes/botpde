'use client'

/** Upload de imagem direto para o Cloudinary, com assinatura do nosso backend. */

const MAX_WIDTH = 1600
const BANNER_MAX_WIDTH = 1920
/** 1024 cobre avatar xl (~96 CSS px) em telas 3x com folga e evita soft de 512. */
const AVATAR_MAX_WIDTH = 1024
const JPEG_QUALITY = 0.85
const AVATAR_JPEG_QUALITY = 0.92

type UploadPurpose =
  | 'comunidade'
  | 'perfil-banner'
  | 'perfil-avatar'
  | 'cadastro'
  | 'sede'
  | 'mensagem'

interface SignResponse {
  cloudName: string
  apiKey: string
  timestamp: number
  folder: string
  signature: string
}

/** Assinatura Cloudinary válida por ~1h — reutiliza entre anexos da mesma sessão. */
const signCache = new Map<string, { sign: SignResponse; expiresAt: number }>()
const SIGN_CACHE_MS = 4 * 60 * 1000

async function obterAssinaturaUpload(
  purpose: UploadPurpose,
  tenantId?: string,
  conversaId?: string,
): Promise<SignResponse> {
  const cacheKey = `${purpose}:${tenantId ?? ''}:${conversaId ?? ''}`
  const hit = signCache.get(cacheKey)
  if (hit && hit.expiresAt > Date.now()) return hit.sign

  const signRes = await fetch('/api/upload/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ purpose, tenantId, conversaId }),
  })
  if (signRes.status === 501) {
    throw new Error('O upload de arquivos ainda não está ativo. Configure o Cloudinary.')
  }
  if (!signRes.ok) {
    const body = (await signRes.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'Falha ao autorizar o upload.')
  }
  const sign = (await signRes.json()) as SignResponse
  signCache.set(cacheKey, { sign, expiresAt: Date.now() + SIGN_CACHE_MS })
  return sign
}

/**
 * Downscale em passos (metade a metade) + smoothing high — um único drawImage
 * de 4k→512 deixa a foto mole; passos preservam nitidez.
 */
function scaleToCanvas(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  destW: number,
  destH: number,
): HTMLCanvasElement | null {
  let cur: CanvasImageSource = source
  let curW = srcW
  let curH = srcH

  while (curW / 2 >= destW && curH / 2 >= destH) {
    const nextW = Math.round(curW / 2)
    const nextH = Math.round(curH / 2)
    const step = document.createElement('canvas')
    step.width = nextW
    step.height = nextH
    const ctx = step.getContext('2d')
    if (!ctx) return null
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(cur, 0, 0, curW, curH, 0, 0, nextW, nextH)
    cur = step
    curW = nextW
    curH = nextH
  }

  const canvas = document.createElement('canvas')
  canvas.width = destW
  canvas.height = destH
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(cur, 0, 0, curW, curH, 0, 0, destW, destH)
  return canvas
}

/** Redimensiona/comprime no cliente antes de subir (economiza banda e storage). */
async function compress(file: File, purpose: UploadPurpose): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file
  const maxWidth =
    purpose === 'perfil-avatar'
      ? AVATAR_MAX_WIDTH
      : purpose === 'perfil-banner'
        ? BANNER_MAX_WIDTH
        : MAX_WIDTH
  const quality = purpose === 'perfil-avatar' ? AVATAR_JPEG_QUALITY : JPEG_QUALITY
  try {
    const bitmap = await createImageBitmap(file)
    const ratio = Math.min(1, maxWidth / bitmap.width)
    if (ratio === 1) {
      bitmap.close()
      return file
    }
    const destW = Math.round(bitmap.width * ratio)
    const destH = Math.round(bitmap.height * ratio)
    const canvas = scaleToCanvas(bitmap, bitmap.width, bitmap.height, destW, destH)
    bitmap.close()
    if (!canvas) return file
    // PNG preserva transparência (ex.: foto de unidade/logo com fundo transparente).
    const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, outputType, outputType === 'image/jpeg' ? quality : undefined),
    )
    return blob ?? file
  } catch {
    return file
  }
}

export async function uploadMediaToCloudinary(
  file: File,
  onProgress?: (pct: number) => void,
  purpose: UploadPurpose = 'comunidade',
  tenantId?: string,
  conversaId?: string,
): Promise<string> {
  const isVideo = file.type.startsWith('video/')
  if (purpose !== 'comunidade' && purpose !== 'mensagem' && isVideo) {
    throw new Error(
      purpose === 'sede'
        ? 'Apenas imagens são permitidas para a foto da unidade.'
        : 'Apenas imagens são permitidas para o perfil.',
    )
  }
  if (purpose === 'cadastro' && !tenantId) {
    throw new Error('Torcida inválida para upload.')
  }
  if (purpose === 'mensagem' && !conversaId) {
    throw new Error('Conversa inválida para upload.')
  }

  const sign = await obterAssinaturaUpload(purpose, tenantId, conversaId)

  // Vídeo sobe sem compressão no cliente; imagem é redimensionada antes.
  const blob = isVideo ? file : await compress(file, purpose)
  const form = new FormData()
  form.append('file', blob, file.name)
  form.append('api_key', sign.apiKey)
  form.append('timestamp', String(sign.timestamp))
  form.append('folder', sign.folder)
  form.append('signature', sign.signature)

  const resourceType = isVideo ? 'video' : 'image'
  const endpoint = `https://api.cloudinary.com/v1_1/${sign.cloudName}/${resourceType}/upload`

  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve((JSON.parse(xhr.responseText) as { secure_url: string }).secure_url)
        } catch {
          reject(new Error('Resposta inválida do Cloudinary.'))
        }
      } else {
        reject(new Error('O upload falhou. Tente novamente.'))
      }
    }
    xhr.onerror = () => reject(new Error('Erro de rede no upload.'))
    xhr.open('POST', endpoint)
    xhr.send(form)
  })
}
