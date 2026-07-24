'use client'

import { useId, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { Camera, CloudUpload, ImageIcon, Loader2, X } from 'lucide-react'

export type ImageDropFileMeta = {
  name: string
  /** Ex.: "120 KB" ou "60 KB de 120 KB" */
  sizeLabel?: string
  status?: 'idle' | 'uploading' | 'done'
  previewUrl?: string
  /** Força remount da miniatura (ex.: novo upload com URL cacheada). */
  previewKey?: string
}

type Props = {
  onFile: (file: File) => void
  accept?: string
  disabled?: boolean
  busy?: boolean
  /** Chip do arquivo atual (selecionado / enviando / anexado). */
  file?: ImageDropFileMeta | null
  onClear?: () => void
  /** Título opcional acima da zona (sem chrome de modal). */
  label?: ReactNode
  prompt?: string
  formatsHint?: string
  browseLabel?: string
  /** Segundo input com `capture="environment"` (mobile). */
  cameraLabel?: string
  className?: string
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Zona de upload no padrão visual: dashed drop + Browse + chip do arquivo.
 * Não faz crop/upload — só escolhe o `File` (arrastar, galeria ou câmera).
 */
export function ImageDropZone({
  onFile,
  accept = 'image/jpeg,image/png,image/webp,image/gif',
  disabled = false,
  busy = false,
  file = null,
  onClear,
  label,
  prompt = 'Escolha um arquivo ou arraste e solte aqui',
  formatsHint = 'JPEG, PNG, WebP ou GIF, até 10 MB',
  browseLabel = 'Procurar arquivo',
  cameraLabel,
  className,
}: Props) {
  const baseId = useId()
  const fileInputId = `${baseId}-file`
  const cameraInputId = `${baseId}-camera`
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const locked = disabled || busy

  function takeFile(list: FileList | null | undefined) {
    const f = list?.[0]
    if (!f || locked) return
    onFile(f)
  }

  function onDragOver(e: DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (locked) return
    setDragging(true)
  }

  function onDragLeave(e: DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragging(false)
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragging(false)
    takeFile(e.dataTransfer.files)
  }

  const statusText =
    file?.status === 'uploading'
      ? 'Enviando…'
      : file?.status === 'done'
        ? 'Anexada'
        : file
          ? 'Pronta para ajustar'
          : null

  return (
    <div className={className}>
      {label != null && (
        <div className="mb-2 text-xs font-medium text-[rgb(var(--foreground-muted))]">{label}</div>
      )}

      <div
        role="button"
        tabIndex={locked ? -1 : 0}
        aria-disabled={locked}
        aria-label={prompt}
        onKeyDown={(e) => {
          if (locked) return
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            fileRef.current?.click()
          }
        }}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={[
          'flex flex-col items-center justify-center rounded-2xl border border-dashed px-4 py-8 text-center transition-[border-color,background-color,box-shadow] duration-150',
          dragging
            ? 'border-[rgb(var(--color-primary))] bg-[rgb(var(--color-primary)_/_0.06)] shadow-[inset_0_0_0_1px_rgb(var(--color-primary)_/_0.25)]'
            : 'border-[rgb(var(--border))] bg-[rgb(var(--background-subtle)_/_0.35)] hover:border-[rgb(var(--foreground-muted)_/_0.45)] hover:bg-[rgb(var(--background-subtle)_/_0.55)]',
          locked ? 'pointer-events-none opacity-60' : 'cursor-pointer',
        ].join(' ')}
        onClick={() => {
          if (!locked) fileRef.current?.click()
        }}
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[rgb(var(--surface))] text-[rgb(var(--foreground-muted))] ring-1 ring-[rgb(var(--border))]">
          {busy ? (
            <Loader2 className="h-5 w-5 animate-spin text-[rgb(var(--color-primary-fg))]" />
          ) : (
            <CloudUpload className="h-5 w-5" strokeWidth={1.75} />
          )}
        </span>
        <p className="mt-3 text-sm font-semibold text-[rgb(var(--foreground))] text-balance">
          {busy ? 'Enviando imagem…' : prompt}
        </p>
        <p className="mt-1 max-w-xs text-xs text-[rgb(var(--foreground-muted))]">{formatsHint}</p>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <span
            className="inline-flex items-center justify-center rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3.5 py-2 text-sm font-medium text-[rgb(var(--foreground))] shadow-sm"
            aria-hidden
          >
            {browseLabel}
          </span>
          {cameraLabel && (
            <button
              type="button"
              disabled={locked}
              onClick={(e) => {
                e.stopPropagation()
                cameraRef.current?.click()
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3.5 py-2 text-sm font-medium text-[rgb(var(--foreground))] shadow-sm hover:bg-[rgb(var(--background-subtle))] disabled:opacity-50"
            >
              <Camera className="h-3.5 w-3.5" />
              {cameraLabel}
            </button>
          )}
        </div>
      </div>

      <input
        ref={fileRef}
        id={fileInputId}
        type="file"
        accept={accept}
        className="sr-only"
        disabled={locked}
        tabIndex={-1}
        onChange={(e) => {
          takeFile(e.target.files)
          e.target.value = ''
        }}
      />
      {cameraLabel && (
        <input
          ref={cameraRef}
          id={cameraInputId}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          disabled={locked}
          tabIndex={-1}
          onChange={(e) => {
            takeFile(e.target.files)
            e.target.value = ''
          }}
        />
      )}

      {file && (
        <div className="mt-3 flex items-center gap-3 rounded-2xl bg-[rgb(var(--background-subtle))] px-3 py-2.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[rgb(var(--surface))] ring-1 ring-[rgb(var(--border))]">
            {file.previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={file.previewKey ?? file.previewUrl}
                src={file.previewUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <ImageIcon className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[rgb(var(--foreground))]">{file.name}</p>
            <p className="mt-0.5 truncate text-xs text-[rgb(var(--foreground-muted))]">
              {[file.sizeLabel, statusText].filter(Boolean).join(' · ')}
            </p>
          </div>
          {onClear && !busy && (
            <button
              type="button"
              onClick={onClear}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--surface))] hover:text-[rgb(var(--foreground))]"
              aria-label="Remover imagem"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          {busy && (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[rgb(var(--foreground-muted))]" />
          )}
        </div>
      )}
    </div>
  )
}

export { formatBytes as formatImageFileBytes }
