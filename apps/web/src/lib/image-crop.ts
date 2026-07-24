/** Helpers de recorte client-side (canvas) para preview de upload. */

export type CropViewport = {
  /** Zoom relativo ao “cover” (1 = cobre a janela; <1 afasta, >1 aproxima). */
  zoom: number
  /** Deslocamento em px na viewport (após o scale). */
  offsetX: number
  offsetY: number
}

/** Zoom mínimo (afastar) — metade do cover. */
export const MIN_CROP_ZOOM = 0.5
/** Zoom máximo (aproximar) — simétrico ao mínimo para o slider iniciar no meio. */
export const MAX_CROP_ZOOM = 1.5

export const DEFAULT_CROP_VIEWPORT: CropViewport = {
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
}

export function clampCropZoom(zoom: number): number {
  return Math.min(MAX_CROP_ZOOM, Math.max(MIN_CROP_ZOOM, zoom))
}

/** Escala mínima para a imagem cobrir a área de recorte (object-fit: cover). */
export function coverScale(
  imageW: number,
  imageH: number,
  frameW: number,
  frameH: number,
): number {
  if (imageW <= 0 || imageH <= 0 || frameW <= 0 || frameH <= 0) return 1
  return Math.max(frameW / imageW, frameH / imageH)
}

/**
 * Limita o pan para a imagem não “furar” a janela de crop.
 * `drawnW/H` = tamanho da imagem já com coverScale * zoom.
 */
export function clampCropOffset(
  offsetX: number,
  offsetY: number,
  drawnW: number,
  drawnH: number,
  frameW: number,
  frameH: number,
): { offsetX: number; offsetY: number } {
  const maxX = Math.max(0, (drawnW - frameW) / 2)
  const maxY = Math.max(0, (drawnH - frameH) / 2)
  return {
    offsetX: Math.min(maxX, Math.max(-maxX, offsetX)),
    offsetY: Math.min(maxY, Math.max(-maxY, offsetY)),
  }
}

/**
 * Exporta o recorte atual para um Blob JPEG.
 * A viewport espelha o preview: imagem centrada, scale = cover * zoom, + offset.
 */
export async function exportCroppedImage(opts: {
  image: HTMLImageElement | ImageBitmap
  frameW: number
  frameH: number
  viewport: CropViewport
  outputMaxWidth?: number
  quality?: number
}): Promise<Blob> {
  const {
    image,
    frameW,
    frameH,
    viewport,
    outputMaxWidth = 1600,
    quality = 0.92,
  } = opts

  const imageW = 'naturalWidth' in image ? image.naturalWidth : image.width
  const imageH = 'naturalHeight' in image ? image.naturalHeight : image.height
  const base = coverScale(imageW, imageH, frameW, frameH)
  const zoom = clampCropZoom(viewport.zoom)
  const scale = base * zoom
  const drawnW = imageW * scale
  const drawnH = imageH * scale
  const { offsetX, offsetY } = clampCropOffset(
    viewport.offsetX,
    viewport.offsetY,
    drawnW,
    drawnH,
    frameW,
    frameH,
  )

  // Centro da frame − metade da imagem desenhada + offset = canto superior esquerdo
  const drawX = frameW / 2 - drawnW / 2 + offsetX
  const drawY = frameH / 2 - drawnH / 2 + offsetY

  // Exporta na resolução alvo (não na do preview): o frame do modal é só a janela
  // de enquadramento; a imagem-fonte traz os pixels reais.
  const outW = Math.max(1, Math.round(outputMaxWidth))
  const outH = Math.max(1, Math.round(outputMaxWidth * (frameH / frameW)))
  const sx = outW / frameW
  const sy = outH / frameH

  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas indisponível.')

  // Fundo neutro para letterbox quando zoom < 1 (imagem menor que a janela)
  ctx.fillStyle = '#0a0a0a'
  ctx.fillRect(0, 0, outW, outH)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(
    image,
    0,
    0,
    imageW,
    imageH,
    drawX * sx,
    drawY * sy,
    drawnW * sx,
    drawnH * sy,
  )

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality),
  )
  if (!blob) throw new Error('Falha ao gerar a imagem recortada.')
  return blob
}
