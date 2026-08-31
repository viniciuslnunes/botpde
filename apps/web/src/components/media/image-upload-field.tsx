'use client'

import { useState, type ReactNode } from 'react'
import { FieldError, Input } from '@torcida/ui'
import {
  formatImageFileBytes,
  ImageDropZone,
  type ImageDropFileMeta,
} from '@/components/media/image-drop-zone'
import { useCroppedImageUpload } from '@/components/media/use-cropped-image-upload'
import type { UploadPurpose } from '@/lib/cloudinary-upload'

type Props = {
  name: string
  label?: string
  value: string
  onChange: (url: string) => void
  aspect?: number
  purpose?: UploadPurpose
  tenantId?: string
  fieldErrors?: string[]
  hint?: string
  /** Mantido por compat; a drop zone usa "Procurar arquivo". */
  buttonLabel?: string
  preview?: ReactNode
  unsavedLabel?: string
  className?: string
  cropTitle?: string
}

/**
 * Campo de imagem com drop zone + crop antes do upload + URL opcional.
 * Controlado: `value`/`onChange` (e hidden input `name` para FormData).
 */
export function ImageUploadField({
  name,
  label = 'Imagem',
  value,
  onChange,
  aspect = 16 / 9,
  purpose = 'comunidade',
  tenantId,
  fieldErrors,
  hint = 'Ao escolher um arquivo, você ajusta o enquadramento antes do upload.',
  preview,
  unsavedLabel,
  className,
  cropTitle = 'Ajustar e redimensionar',
}: Props) {
  // Estado, não ref: o nome/tamanho do último arquivo escolhido é lido no render
  // (monta o `fileMeta` da drop zone). Em ref, a tela não re-renderizava ao
  // trocar de arquivo — só pegava carona no render seguinte.
  const [ultimoArquivo, setUltimoArquivo] = useState<{
    nome: string
    tamanho: string | undefined
  }>({ nome: 'imagem.jpg', tamanho: undefined })

  const crop = useCroppedImageUpload({
    aspect,
    purpose,
    tenantId,
    title: cropTitle,
    onDone: ({ url, file }) => {
      if (file) {
        setUltimoArquivo({
          nome: file.name || 'imagem.jpg',
          tamanho: formatImageFileBytes(file.size),
        })
      }
      if (url) onChange(url)
    },
  })

  const fileMeta: ImageDropFileMeta | null = value
    ? {
        name: ultimoArquivo.nome,
        sizeLabel: ultimoArquivo.tamanho,
        status: crop.busy ? 'uploading' : 'done',
        previewUrl: value,
      }
    : crop.busy
      ? {
          name: ultimoArquivo.nome,
          sizeLabel: ultimoArquivo.tamanho,
          status: 'uploading',
        }
      : null

  return (
    <div className={className}>
      {crop.dialog}
      <input type="hidden" name={name} value={value} data-unsaved-label={unsavedLabel} />

      <ImageDropZone
        label={label}
        busy={crop.busy}
        file={fileMeta}
        onClear={value ? () => onChange('') : undefined}
        onFile={(file) => {
          setUltimoArquivo({ nome: file.name, tamanho: formatImageFileBytes(file.size) })
          crop.open(file)
        }}
      />

      {preview && !value && <div className="mt-3">{preview}</div>}

      <div className="mt-3 space-y-1.5">
        <Input
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Ou cole a URL (https://…)"
        />
        {hint && <p className="text-[11px] text-[rgb(var(--foreground-muted))]">{hint}</p>}
      </div>
      <FieldError errors={fieldErrors} />
    </div>
  )
}
