'use client'

import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { CloudUpload, Loader2, X, ZoomIn, ZoomOut } from 'lucide-react'
import {
  clampCropOffset,
  clampCropZoom,
  coverScale,
  cropFrameSizeForAspect,
  DEFAULT_CROP_VIEWPORT,
  exportCroppedImage,
  MAX_CROP_ZOOM,
  MIN_CROP_ZOOM,
  type CropViewport,
} from '@/lib/image-crop'
import { AppModal, AppModalBody } from '@/components/ui/app-modal'

type Props = {
  /** Object URL ou data URL da imagem a ajustar. */
  src: string
  title?: string
  /** Proporção da janela (padrão 16:9; sede/logo usam 1). */
  aspect?: number
  confirmLabel?: string
  /** Força o formato de saída; por padrão é detectado automaticamente (transparência real → PNG). */
  format?: 'image/jpeg' | 'image/png'
  onCancel: () => void
  onConfirm: (file: File) => void | Promise<void>
}

/**
 * Modal de ajuste: zoom + pan dentro de recorte fixo antes do upload.
 */
export function ImageCropDialog({
  src,
  title = 'Ajustar imagem',
  aspect = 16 / 9,
  confirmLabel = 'Usar imagem',
  format,
  onCancel,
  onConfirm,
}: Props) {
  const titleId = useId()
  const frameRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const dragRef = useRef<{
    startX: number
    startY: number
    origin: CropViewport
  } | null>(null)

  const [viewport, setViewport] = useState<CropViewport>(DEFAULT_CROP_VIEWPORT)
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [frameSize, setFrameSize] = useState<{ w: number; h: number }>(() =>
    cropFrameSizeForAspect(aspect),
  )
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    const el = frameRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect
      if (!box || box.width <= 0) return
      setFrameSize({ w: box.width, h: box.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  function applyViewport(next: CropViewport) {
    const zoom = clampCropZoom(next.zoom)
    if (!natural) {
      setViewport({ ...next, zoom })
      return
    }
    const base = coverScale(natural.w, natural.h, frameSize.w, frameSize.h)
    const scale = base * zoom
    const clamped = clampCropOffset(
      next.offsetX,
      next.offsetY,
      natural.w * scale,
      natural.h * scale,
      frameSize.w,
      frameSize.h,
    )
    setViewport({ zoom, ...clamped })
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (busy) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origin: viewport,
    }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    applyViewport({
      zoom: dragRef.current.origin.zoom,
      offsetX: dragRef.current.origin.offsetX + dx,
      offsetY: dragRef.current.origin.offsetY + dy,
    })
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    dragRef.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  async function confirmar() {
    const img = imgRef.current
    if (!img || !img.complete || loadError) return
    setBusy(true)
    try {
      const blob = await exportCroppedImage({
        image: img,
        frameW: frameSize.w,
        frameH: frameSize.h,
        viewport,
        format,
      })
      const ext = blob.type === 'image/png' ? 'png' : 'jpg'
      const file = new File([blob], `sede-foto.${ext}`, { type: blob.type })
      await onConfirm(file)
    } catch {
      // erro notificado pelo caller (toast)
    } finally {
      setBusy(false)
    }
  }

  const base =
    natural != null ? coverScale(natural.w, natural.h, frameSize.w, frameSize.h) : 1
  const scale = base * clampCropZoom(viewport.zoom)
  const drawnW = natural ? natural.w * scale : 0
  const drawnH = natural ? natural.h * scale : 0

  return (
    <AppModal
      open
      onClose={onCancel}
      size="md"
      layer="nested"
      labelledBy={titleId}
      busy={busy}
    >
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))] ring-1 ring-[rgb(var(--border))]">
              <CloudUpload className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <div className="min-w-0 pt-0.5">
              <h2 id={titleId} className="text-base font-semibold text-[rgb(var(--foreground))]">
                {title}
              </h2>
              <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
                Arraste para enquadrar e use o zoom para redimensionar.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))] disabled:opacity-50"
            aria-label="Fechar"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <AppModalBody className="space-y-3 px-5 pb-2 pt-4">

          <div
            ref={frameRef}
            className="relative mx-auto w-full max-w-md cursor-grab touch-none overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-black active:cursor-grabbing"
            style={{ aspectRatio: `${aspect}` }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- object/data URL no editor */}
            <img
              ref={imgRef}
              src={src}
              alt=""
              draggable={false}
              className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
              style={{
                width: drawnW || undefined,
                height: drawnH || undefined,
                transform: `translate(calc(-50% + ${viewport.offsetX}px), calc(-50% + ${viewport.offsetY}px))`,
              }}
              onLoad={(e) => {
                const el = e.currentTarget
                setNatural({ w: el.naturalWidth, h: el.naturalHeight })
                setLoadError(false)
                setViewport(DEFAULT_CROP_VIEWPORT)
              }}
              onError={() => setLoadError(true)}
            />
            {loadError && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80 px-4 text-center text-sm text-red-300">
                Não foi possível carregar a imagem para ajuste.
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <ZoomOut className="h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))]" />
            <input
              type="range"
              min={MIN_CROP_ZOOM}
              max={MAX_CROP_ZOOM}
              step={0.01}
              value={viewport.zoom}
              disabled={!natural || busy || loadError}
              onChange={(e) =>
                applyViewport({
                  ...viewport,
                  zoom: Number(e.target.value),
                })
              }
              className="w-full accent-[rgb(var(--primary))]"
              aria-label="Zoom"
            />
            <ZoomIn className="h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))]" />
          </div>
        </AppModalBody>

        <div className="flex flex-wrap justify-end gap-2 px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-2 text-sm font-medium text-[rgb(var(--foreground))] shadow-sm hover:bg-[rgb(var(--background-subtle))] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void confirmar()}
            disabled={busy || !natural || loadError}
            className="inline-flex items-center gap-2 rounded-xl bg-[rgb(var(--primary))] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? 'Processando…' : confirmLabel}
          </button>
        </div>
    </AppModal>
  )
}
