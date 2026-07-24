'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from '@torcida/ui'
import { ImageCropDialog } from '@/components/media/image-crop-dialog'
import { uploadMediaToCloudinary } from '@/lib/cloudinary-upload'

type UploadPurpose = 'comunidade' | 'perfil-banner' | 'perfil-avatar' | 'cadastro' | 'sede'

type Options = {
  aspect?: number
  purpose?: UploadPurpose
  tenantId?: string
  title?: string
  confirmLabel?: string
  /** Se false, só devolve o File recortado (sem Cloudinary). Default true. */
  upload?: boolean
  onDone: (result: { url?: string; file: File }) => void | Promise<void>
}

/**
 * Abre o crop dialog ao escolher arquivo e opcionalmente sobe ao Cloudinary.
 * Uso: `const crop = useCroppedImageUpload({...}); crop.open(file); return <>{crop.dialog}</>`
 */
export function useCroppedImageUpload(opts: Options) {
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const objectUrlRef = useRef<string | null>(null)
  const optsRef = useRef(opts)
  optsRef.current = opts

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    }
  }, [])

  const close = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
    setCropSrc(null)
  }, [])

  const open = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) {
        toast.error('Selecione um arquivo de imagem.')
        return
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error('Imagem muito grande. Máximo: 10MB.')
        return
      }
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
      const url = URL.createObjectURL(file)
      objectUrlRef.current = url
      setCropSrc(url)
    },
    [],
  )

  const openFromSrc = useCallback((src: string) => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
    setCropSrc(src)
  }, [])

  async function onConfirm(file: File) {
    const current = optsRef.current
    setBusy(true)
    try {
      if (current.upload === false) {
        await current.onDone({ file })
        close()
        return
      }
      const url = await toast
        .promise(
          uploadMediaToCloudinary(file, undefined, current.purpose ?? 'comunidade', current.tenantId),
          {
            loading: 'Enviando imagem…',
            success: 'Imagem enviada.',
            error: (err) => (err instanceof Error ? err.message : 'Falha no upload.'),
          },
        )
        .unwrap()
      await current.onDone({ url, file })
      close()
    } catch {
      // toast já notificou
    } finally {
      setBusy(false)
    }
  }

  const dialog =
    cropSrc != null ? (
      <ImageCropDialog
        src={cropSrc}
        title={opts.title ?? 'Ajustar e redimensionar'}
        aspect={opts.aspect ?? 16 / 9}
        confirmLabel={busy ? 'Enviando…' : (opts.confirmLabel ?? 'Confirmar e enviar')}
        onCancel={close}
        onConfirm={onConfirm}
      />
    ) : null

  return { open, openFromSrc, close, dialog, busy, isOpen: cropSrc != null }
}
