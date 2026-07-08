'use client'

/** Upload de imagem direto para o Cloudinary, com assinatura do nosso backend. */

const MAX_WIDTH = 1600
const JPEG_QUALITY = 0.85

interface SignResponse {
  cloudName: string
  apiKey: string
  timestamp: number
  folder: string
  signature: string
}

/** Redimensiona/comprime no cliente antes de subir (economiza banda e storage). */
async function compress(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file
  try {
    const bitmap = await createImageBitmap(file)
    const ratio = Math.min(1, MAX_WIDTH / bitmap.width)
    if (ratio === 1) return file
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * ratio)
    canvas.height = Math.round(bitmap.height * ratio)
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, 'image/jpeg', JPEG_QUALITY),
    )
    return blob ?? file
  } catch {
    return file
  }
}

export async function uploadImageToCloudinary(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<string> {
  const signRes = await fetch('/api/upload/sign', { method: 'POST' })
  if (signRes.status === 501) {
    throw new Error('O upload de arquivos ainda não está ativo. Configure o Cloudinary.')
  }
  if (!signRes.ok) {
    const body = (await signRes.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'Falha ao autorizar o upload.')
  }
  const sign = (await signRes.json()) as SignResponse

  const blob = await compress(file)
  const form = new FormData()
  form.append('file', blob, file.name)
  form.append('api_key', sign.apiKey)
  form.append('timestamp', String(sign.timestamp))
  form.append('folder', sign.folder)
  form.append('signature', sign.signature)

  const endpoint = `https://api.cloudinary.com/v1_1/${sign.cloudName}/image/upload`

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
