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

/**
 * Proporção da capa da loja — crop e cards (`aspect-[16/9]`) precisam coincidir.
 */
export const LOJA_CAPA_ASPECT = 16 / 9

/** Tamanho inicial do frame (antes do ResizeObserver) no mesmo aspecto do CSS. */
export function cropFrameSizeForAspect(
  aspect: number,
  width = 320,
): { w: number; h: number } {
  if (!(aspect > 0) || !(width > 0)) return { w: 320, h: 180 }
  return { w: width, h: width / aspect }
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

/** Amostra a alpha do canvas para decidir se o recorte precisa de PNG (transparência real). */
function hasTransparency(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const { data } = ctx.getImageData(0, 0, w, h)
  // Amostragem em grade (não pixel a pixel) — suficiente pra detectar transparência real
  // sem custo de varrer todo o buffer em imagens grandes.
  const stepX = Math.max(1, Math.floor(w / 96))
  const stepY = Math.max(1, Math.floor(h / 96))
  for (let y = 0; y < h; y += stepY) {
    for (let x = 0; x < w; x += stepX) {
      const idx = (y * w + x) * 4 + 3
      if (data[idx] < 255) return true
    }
  }
  return false
}

/**
 * Exporta o recorte atual para um Blob. Por padrão detecta transparência real no
 * recorte e usa PNG (sem letterbox) quando ela existe — ex.: logo/foto de unidade
 * com fundo transparente; caso contrário usa JPEG com fundo neutro no letterbox.
 * A viewport espelha o preview: imagem centrada, scale = cover * zoom, + offset.
 */
export async function exportCroppedImage(opts: {
  image: HTMLImageElement | ImageBitmap
  frameW: number
  frameH: number
  viewport: CropViewport
  outputMaxWidth?: number
  quality?: number
  /** Força o formato; por padrão é detectado automaticamente (transparência → PNG). */
  format?: 'image/jpeg' | 'image/png'
}): Promise<Blob> {
  const { image, frameW, frameH, viewport, outputMaxWidth = 1600, quality = 0.92, format } = opts

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

  // Desenha sem fundo primeiro — letterbox (zoom < 1) fica transparente até decidirmos o formato.
  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas indisponível.')
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

  const resolvedFormat = format ?? (hasTransparency(ctx, outW, outH) ? 'image/png' : 'image/jpeg')

  if (resolvedFormat === 'image/png') {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('Falha ao gerar a imagem recortada.')
    return blob
  }

  // JPEG não tem alpha — compõe sobre um fundo opaco (cobre o letterbox e qualquer
  // transparência residual) antes de exportar.
  const opaque = document.createElement('canvas')
  opaque.width = outW
  opaque.height = outH
  const octx = opaque.getContext('2d')
  if (!octx) throw new Error('Canvas indisponível.')
  octx.fillStyle = '#0a0a0a'
  octx.fillRect(0, 0, outW, outH)
  octx.drawImage(canvas, 0, 0)

  const blob = await new Promise<Blob | null>((resolve) =>
    opaque.toBlob(resolve, 'image/jpeg', quality),
  )
  if (!blob) throw new Error('Falha ao gerar a imagem recortada.')
  return blob
}
