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
  /**
   * `stack` — drop zone em cima, chip pequeno embaixo (padrão).
   * `split` — prévia grande e drop zone lado a lado quando há imagem.
   */
  layout?: 'stack' | 'split'
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
  layout = 'stack',
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
  const splitPreview = layout === 'split' && Boolean(file?.previewUrl)

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

  const dropZone = (
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
        'flex flex-col items-center justify-center rounded-2xl border border-dashed text-center transition-[border-color,background-color,box-shadow] duration-150',
        splitPreview ? 'h-full min-h-[10rem] px-3 py-3 sm:px-4' : 'px-4 py-8',
        dragging
          ? 'border-[rgb(var(--color-primary))] bg-[rgb(var(--color-primary)_/_0.06)] shadow-[inset_0_0_0_1px_rgb(var(--color-primary)_/_0.25)]'
          : 'border-[rgb(var(--border))] bg-[rgb(var(--background-subtle)_/_0.35)] hover:border-[rgb(var(--foreground-muted)_/_0.45)] hover:bg-[rgb(var(--background-subtle)_/_0.55)]',
        locked ? 'pointer-events-none opacity-60' : 'cursor-pointer',
      ].join(' ')}
      onClick={() => {
        if (!locked) fileRef.current?.click()
      }}
    >
      <span
        className={[
          'flex items-center justify-center rounded-full bg-[rgb(var(--surface))] text-[rgb(var(--foreground-muted))] ring-1 ring-[rgb(var(--border))]',
          splitPreview ? 'h-8 w-8' : 'h-11 w-11',
        ].join(' ')}
      >
        {busy ? (
          <Loader2 className="h-5 w-5 animate-spin text-[rgb(var(--color-primary-fg))]" />
        ) : (
          <CloudUpload className={splitPreview ? 'h-3.5 w-3.5' : 'h-5 w-5'} strokeWidth={1.75} />
        )}
      </span>
      <p
        className={[
          'font-semibold text-[rgb(var(--foreground))] text-balance',
          splitPreview ? 'mt-1.5 text-xs' : 'mt-3 text-sm',
        ].join(' ')}
      >
        {busy ? 'Enviando imagem…' : prompt}
      </p>
      <p
        className={[
          'text-[rgb(var(--foreground-muted))]',
          splitPreview ? 'mt-0.5 line-clamp-2 max-w-[16rem] text-[10px] leading-snug' : 'mt-1 max-w-xs text-xs',
        ].join(' ')}
      >
        {formatsHint}
      </p>

      <div className={['flex flex-wrap items-center justify-center gap-2', splitPreview ? 'mt-2' : 'mt-4'].join(' ')}>
        <span
          className={[
            'inline-flex items-center justify-center rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] font-medium text-[rgb(var(--foreground))] shadow-sm',
            splitPreview ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-sm',
          ].join(' ')}
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
  )

  return (
    <div className={className}>
      {label != null && (
        <div className="mb-2 text-xs font-medium text-[rgb(var(--foreground-muted))]">{label}</div>
      )}

      {splitPreview && file?.previewUrl ? (
        <div className="grid gap-3 sm:grid-cols-2 sm:items-stretch">
          <div className="relative aspect-square max-h-56 overflow-hidden rounded-2xl bg-[rgb(var(--background-subtle))] ring-1 ring-[rgb(var(--border))] sm:max-h-64">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={file.previewKey ?? file.previewUrl}
              src={file.previewUrl}
              alt=""
              className="h-full w-full object-contain p-2"
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/75 via-black/40 to-transparent px-3 pb-2 pt-8">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-white sm:text-sm">{file.name}</p>
                <p className="mt-0.5 truncate text-[11px] text-white/75">
                  {[file.sizeLabel, statusText].filter(Boolean).join(' · ')}
                </p>
              </div>
              {onClear && !busy && (
                <button
                  type="button"
                  onClick={onClear}
                  className="pointer-events-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm hover:bg-white/25"
                  aria-label="Remover imagem"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              {busy && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-white/80" />}
            </div>
          </div>
          {dropZone}
        </div>
      ) : (
        dropZone
      )}

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

      {file && !splitPreview && (
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
              className="app-touch-target flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--surface))] hover:text-[rgb(var(--foreground))]"
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
