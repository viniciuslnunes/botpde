'use client'

import { useState, useCallback } from 'react'

interface UploadOptions {
  maxSizeMB?: number
  accept?: string[]
  compressImages?: boolean
  maxWidthPx?: number
}

interface UploadState {
  progress: number
  uploading: boolean
  error: string | null
  url: string | null
}

const DEFAULT_MAX_SIZE_MB = 5
const DEFAULT_MAX_WIDTH = 1200

/**
 * Comprime uma imagem no cliente antes de enviar.
 * Reduz custo de storage e tempo de upload.
 */
async function compressImage(file: File, maxWidth = DEFAULT_MAX_WIDTH): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      const canvas = document.createElement('canvas')
      const ratio = Math.min(1, maxWidth / img.width)
      canvas.width = img.width * ratio
      canvas.height = img.height * ratio

      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('Canvas não disponível'))

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url)
          if (!blob) return reject(new Error('Falha ao comprimir imagem'))
          resolve(blob)
        },
        'image/jpeg',
        0.85,
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Falha ao carregar imagem'))
    }

    img.src = url
  })
}

export function useUpload(endpoint: string, options: UploadOptions = {}) {
  const {
    maxSizeMB = DEFAULT_MAX_SIZE_MB,
    accept = ['image/jpeg', 'image/png', 'image/webp'],
    compressImages = true,
    maxWidthPx = DEFAULT_MAX_WIDTH,
  } = options

  const [state, setState] = useState<UploadState>({
    progress: 0,
    uploading: false,
    error: null,
    url: null,
  })

  const upload = useCallback(
    async (file: File): Promise<string | null> => {
      // Validação de tipo
      if (accept.length > 0 && !accept.includes(file.type)) {
        const error = `Tipo de arquivo não permitido. Use: ${accept.join(', ')}`
        setState((s) => ({ ...s, error }))
        return null
      }

      // Validação de tamanho
      if (file.size > maxSizeMB * 1024 * 1024) {
        const error = `Arquivo muito grande. Máximo: ${maxSizeMB}MB`
        setState((s) => ({ ...s, error }))
        return null
      }

      setState({ progress: 0, uploading: true, error: null, url: null })

      try {
        let fileToUpload: Blob = file

        if (compressImages && file.type.startsWith('image/')) {
          setState((s) => ({ ...s, progress: 10 }))
          fileToUpload = await compressImage(file, maxWidthPx)
        }

        const formData = new FormData()
        formData.append('file', fileToUpload, file.name)

        setState((s) => ({ ...s, progress: 30 }))

        const xhr = new XMLHttpRequest()

        const url = await new Promise<string>((resolve, reject) => {
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const progress = Math.round(30 + (e.loaded / e.total) * 60)
              setState((s) => ({ ...s, progress }))
            }
          }

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              const { url } = JSON.parse(xhr.responseText)
              resolve(url)
            } else {
              reject(new Error(`Upload falhou: ${xhr.status}`))
            }
          }

          xhr.onerror = () => reject(new Error('Erro de rede no upload'))

          xhr.open('POST', endpoint)
          xhr.withCredentials = true
          xhr.send(formData)
        })

        setState({ progress: 100, uploading: false, error: null, url })
        return url
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Erro no upload'
        setState((s) => ({ ...s, uploading: false, error, progress: 0 }))
        return null
      }
    },
    [endpoint, accept, maxSizeMB, compressImages, maxWidthPx],
  )

  const reset = useCallback(() => {
    setState({ progress: 0, uploading: false, error: null, url: null })
  }, [])

  return { ...state, upload, reset }
}
