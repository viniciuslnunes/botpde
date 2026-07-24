/**
 * Detecta logo circular em canvas quadrado com fundo branco “assado”.
 *
 * Só retorna true quando:
 * 1. Cantos são brancos opacos (há quadrado branco a cortar)
 * 2. O conteúdo (não-branco) cabe no círculo inscrito
 * 3. A área fora do círculo é majoritariamente branca
 *
 * PNG com alpha (ex.: Gaviões) → false (cantos transparentes, sem máscara).
 * Badge redondo quase full-bleed (Camisa 12) → true (cantos brancos + disco).
 */

const SAMPLE = 64

function isTransparente(data: Uint8ClampedArray, i: number): boolean {
  return data[i + 3]! < 40
}

/** Fundo branco/cinza-claro opaco. */
function isBrancoOpaco(data: Uint8ClampedArray, i: number): boolean {
  const a = data[i + 3]!
  if (a < 180) return false
  const r = data[i]!
  const g = data[i + 1]!
  const b = data[i + 2]!
  // Tolerância maior: JPGs comprimidos não são #FFFFFF puro.
  return r > 230 && g > 230 && b > 230
}

function idx(x: number, y: number): number {
  return (y * SAMPLE + x) * 4
}

function amostraBranco(
  data: Uint8ClampedArray,
  x: number,
  y: number,
  raio = 2,
): boolean {
  let ok = 0
  let total = 0
  for (let dy = -raio; dy <= raio; dy++) {
    for (let dx = -raio; dx <= raio; dx++) {
      const px = Math.min(SAMPLE - 1, Math.max(0, x + dx))
      const py = Math.min(SAMPLE - 1, Math.max(0, y + dy))
      total += 1
      if (isBrancoOpaco(data, idx(px, py))) ok += 1
    }
  }
  return ok / total >= 0.7
}

/** Analisa pixels já desenhados num canvas SAMPLE×SAMPLE. */
export function analisarEscudoCircularDeImageData(data: Uint8ClampedArray): boolean {
  if (data.length < SAMPLE * SAMPLE * 4) return false

  const cantos: Array<[number, number]> = [
    [2, 2],
    [SAMPLE - 3, 2],
    [2, SAMPLE - 3],
    [SAMPLE - 3, SAMPLE - 3],
  ]

  // Sem cantos brancos → nada a mascarar (alpha já resolve, ex.: Gaviões).
  if (!cantos.every(([x, y]) => amostraBranco(data, x, y))) return false

  const cx = (SAMPLE - 1) / 2
  const cy = (SAMPLE - 1) / 2
  // Raio um pouco além de 0.5*lado para badges full-bleed com antialias na borda.
  const r2 = (SAMPLE * 0.52) ** 2

  let conteudo = 0
  let conteudoDentro = 0
  let fora = 0
  let brancoFora = 0

  for (let y = 0; y < SAMPLE; y++) {
    for (let x = 0; x < SAMPLE; x++) {
      const i = idx(x, y)
      const dx = x - cx
      const dy = y - cy
      const dist2 = dx * dx + dy * dy
      const foraCirculo = dist2 > r2

      if (isTransparente(data, i) || isBrancoOpaco(data, i)) {
        if (foraCirculo) {
          fora += 1
          if (isBrancoOpaco(data, i)) brancoFora += 1
        }
        continue
      }

      // Pixel de conteúdo (tinta do logo)
      conteudo += 1
      if (!foraCirculo) conteudoDentro += 1
    }
  }

  if (conteudo < 24) return false
  // Quase todo o conteúdo dentro do círculo.
  if (conteudoDentro / conteudo < 0.85) return false
  // Fora do círculo deve ser majoritariamente o fundo branco do quadrado.
  if (fora < 12) return false
  if (brancoFora / fora < 0.75) return false

  return true
}

function carregarImagem(src: string, crossOrigin?: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    if (crossOrigin) img.crossOrigin = crossOrigin
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('img-load'))
    img.src = src
  })
}

function analisarElemento(img: HTMLImageElement): boolean {
  const canvas = document.createElement('canvas')
  canvas.width = SAMPLE
  canvas.height = SAMPLE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return false
  ctx.clearRect(0, 0, SAMPLE, SAMPLE)
  ctx.drawImage(img, 0, 0, SAMPLE, SAMPLE)
  try {
    const { data } = ctx.getImageData(0, 0, SAMPLE, SAMPLE)
    return analisarEscudoCircularDeImageData(data)
  } catch {
    // Canvas tainted (CORS)
    return false
  }
}

/**
 * Carrega a URL e decide se deve aplicar máscara circular.
 * Tenta: fetch→blob (CORS), URL direta, e proxy `/_next/image` (same-origin).
 */
export async function detectarEscudoCircular(url: string): Promise<boolean> {
  if (typeof window === 'undefined' || !url) return false

  // 1) Fetch CORS → blob same-origin (melhor chance de ler pixels).
  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit', cache: 'force-cache' })
    if (res.ok) {
      const blob = await res.blob()
      const obj = URL.createObjectURL(blob)
      try {
        const img = await carregarImagem(obj)
        return analisarElemento(img)
      } finally {
        URL.revokeObjectURL(obj)
      }
    }
  } catch {
    // segue fallbacks
  }

  // 2) URL direta com crossOrigin anonymous.
  try {
    const img = await carregarImagem(url, 'anonymous')
    const ok = analisarElemento(img)
    if (ok) return true
    // Se leu pixels e disse false, confiar (não é circular com branco).
    // Se canvas tainted, analisarElemento retorna false — tentar proxy.
  } catch {
    // segue
  }

  // 3) Proxy same-origin do Next Image Optimizer.
  try {
    const proxied = `/_next/image?url=${encodeURIComponent(url)}&w=128&q=75`
    const img = await carregarImagem(proxied)
    return analisarElemento(img)
  } catch {
    return false
  }
}
