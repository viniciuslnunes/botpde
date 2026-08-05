/** Recorte do conteúdo opaco de um bitmap (ignora padding transparente). */

export type BBox = { x: number; y: number; w: number; h: number }

export type DestinoContain = { dx: number; dy: number; dw: number; dh: number }

/**
 * Bounding box dos pixels com alpha ≥ `alphaMin`.
 * Retorna null se a imagem for totalmente transparente.
 */
export function bboxConteudoOpaco(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  alphaMin = 24,
): BBox | null {
  if (width <= 0 || height <= 0) return null
  if (data.length < width * height * 4) return null

  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3]!
      if (a < alphaMin) continue
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }

  if (maxX < 0) return null
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

/** Encaixa `srcW×srcH` em `box` com padding uniforme (object-fit: contain). */
export function destinoContain(
  srcW: number,
  srcH: number,
  box: number,
  padding: number,
): DestinoContain {
  const inner = Math.max(1, box - padding * 2)
  const scale = Math.min(inner / Math.max(1, srcW), inner / Math.max(1, srcH))
  const dw = srcW * scale
  const dh = srcH * scale
  return {
    dx: (box - dw) / 2,
    dy: (box - dh) / 2,
    dw,
    dh,
  }
}
