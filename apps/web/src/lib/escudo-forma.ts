/**
 * Detecta logo circular em canvas quadrado com fundo opaco “assado”.
 *
 * Só retorna true quando:
 * 1. Cantos são opacos (há quadrado de fundo a cortar — branco, preto ou cor)
 * 2. O conteúdo (não-fundo) cabe no círculo inscrito
 * 3. A área fora do círculo é majoritariamente a cor de fundo
 *
 * PNG com alpha nos cantos (ex.: Gaviões, escudo do Corinthians) → false
 * (sem máscara — a transparência já resolve o formato).
 * Badge redondo em fundo branco (Camisa 12) ou preto (logo em square) → true.
 *
 * Fonte da verdade no upload: `tratarFundoEscudoNoCanvas` grava PNG com os
 * cantos já transparentes. A detecção na exibição (`useEscudoCircular`) fica
 * como fallback do acervo antigo e de escudos de catálogo.
 */

const SAMPLE = 64
/** Raio da máscara / do critério, relativo ao menor lado (full-bleed + antialias). */
export const ESCUDO_RAIO_FRAC = 0.52
/** Tolerância RGB ao comparar pixel com a cor de fundo amostrada nos cantos. */
const TOL_FUNDO = 36

function isTransparente(data: Uint8ClampedArray, i: number): boolean {
  return data[i + 3]! < 40
}

function isOpaco(data: Uint8ClampedArray, i: number): boolean {
  return data[i + 3]! >= 180
}

function corDe(data: Uint8ClampedArray, i: number): [number, number, number] {
  return [data[i]!, data[i + 1]!, data[i + 2]!]
}

function coresProximas(
  a: [number, number, number],
  b: [number, number, number],
  tol = TOL_FUNDO,
): boolean {
  return (
    Math.abs(a[0] - b[0]) <= tol &&
    Math.abs(a[1] - b[1]) <= tol &&
    Math.abs(a[2] - b[2]) <= tol
  )
}

function idx(x: number, y: number): number {
  return (y * SAMPLE + x) * 4
}

type AmostraCanto = { transparente: number; opaco: number; rgb: [number, number, number] }

function amostrarCanto(
  data: Uint8ClampedArray,
  x: number,
  y: number,
  raio = 2,
): AmostraCanto {
  let transparente = 0
  let opaco = 0
  let r = 0
  let g = 0
  let b = 0
  for (let dy = -raio; dy <= raio; dy++) {
    for (let dx = -raio; dx <= raio; dx++) {
      const px = Math.min(SAMPLE - 1, Math.max(0, x + dx))
      const py = Math.min(SAMPLE - 1, Math.max(0, y + dy))
      const i = idx(px, py)
      if (isTransparente(data, i)) {
        transparente += 1
        continue
      }
      if (!isOpaco(data, i)) continue
      opaco += 1
      const [cr, cg, cb] = corDe(data, i)
      r += cr
      g += cg
      b += cb
    }
  }
  return {
    transparente,
    opaco,
    rgb: opaco > 0 ? [r / opaco, g / opaco, b / opaco] : [0, 0, 0],
  }
}

function isFundoOpaco(
  data: Uint8ClampedArray,
  i: number,
  fundo: [number, number, number],
): boolean {
  if (!isOpaco(data, i)) return false
  return coresProximas(corDe(data, i), fundo)
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

  const amostras = cantos.map(([x, y]) => amostrarCanto(data, x, y))

  // Cantos com alpha → PNG transparente; não mascarar.
  if (amostras.some((a) => a.transparente > a.opaco)) return false
  if (amostras.some((a) => a.opaco === 0)) return false

  // Cor de fundo = média dos cantos opacos; todos devem concordar.
  const fundo: [number, number, number] = [
    amostras.reduce((s, a) => s + a.rgb[0], 0) / amostras.length,
    amostras.reduce((s, a) => s + a.rgb[1], 0) / amostras.length,
    amostras.reduce((s, a) => s + a.rgb[2], 0) / amostras.length,
  ]
  if (!amostras.every((a) => coresProximas(a.rgb, fundo))) return false

  const cx = (SAMPLE - 1) / 2
  const cy = (SAMPLE - 1) / 2
  // Raio um pouco além de 0.5*lado para badges full-bleed com antialias na borda.
  const r2 = (SAMPLE * ESCUDO_RAIO_FRAC) ** 2

  let conteudo = 0
  let conteudoDentro = 0
  let fora = 0
  let fundoFora = 0

  for (let y = 0; y < SAMPLE; y++) {
    for (let x = 0; x < SAMPLE; x++) {
      const i = idx(x, y)
      const dx = x - cx
      const dy = y - cy
      const dist2 = dx * dx + dy * dy
      const foraCirculo = dist2 > r2

      if (isTransparente(data, i) || isFundoOpaco(data, i, fundo)) {
        if (foraCirculo) {
          fora += 1
          if (isFundoOpaco(data, i, fundo)) fundoFora += 1
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
  // Fora do círculo deve ser majoritariamente o fundo do quadrado.
  if (fora < 12) return false
  if (fundoFora / fora < 0.75) return false

  // Escudo heráldico em quadrado branco cabe no círculo mas não é badge redondo.
  if (pareceSilhuetaEscudoHeraldico(data, fundo)) return false

  return true
}

/** Silhueta alta ou mais larga no topo → escudo de clube, não badge circular. */
function pareceSilhuetaEscudoHeraldico(
  data: Uint8ClampedArray,
  fundo: [number, number, number],
): boolean {
  let minX = SAMPLE
  let maxX = -1
  let minY = SAMPLE
  let maxY = -1
  const larguraPorLinha = new Int16Array(SAMPLE).fill(-1)

  for (let y = 0; y < SAMPLE; y++) {
    let rowMin = SAMPLE
    let rowMax = -1
    for (let x = 0; x < SAMPLE; x++) {
      const i = idx(x, y)
      if (isTransparente(data, i) || isFundoOpaco(data, i, fundo)) continue
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
      rowMin = Math.min(rowMin, x)
      rowMax = Math.max(rowMax, x)
    }
    if (rowMax >= rowMin) larguraPorLinha[y] = rowMax - rowMin + 1
  }

  if (maxX < minX || maxY < minY) return false

  const w = maxX - minX + 1
  const h = maxY - minY + 1
  if (h > w * 1.06) return true

  let yMaxLarg = minY
  let maxLarg = 0
  for (let y = minY; y <= maxY; y++) {
    const larg = larguraPorLinha[y]!
    if (larg > maxLarg) {
      maxLarg = larg
      yMaxLarg = y
    }
  }
  const fracaoVertical = (yMaxLarg - minY) / Math.max(1, h - 1)
  return fracaoVertical < 0.35 && maxLarg > w * 0.75
}

/** Zera o alpha fora do círculo inscrito (cantos do quadrado de fundo). */
export function aplicarMascaraCircularEmImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): void {
  if (width < 1 || height < 1) return
  const cx = (width - 1) / 2
  const cy = (height - 1) / 2
  const r2 = (Math.min(width, height) * ESCUDO_RAIO_FRAC) ** 2
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx
      const dy = y - cy
      if (dx * dx + dy * dy > r2) {
        data[(y * width + x) * 4 + 3] = 0
      }
    }
  }
}

function analisarSourceAmostrado(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
): boolean {
  if (typeof document === 'undefined') return false
  const sample = document.createElement('canvas')
  sample.width = SAMPLE
  sample.height = SAMPLE
  const ctx = sample.getContext('2d', { willReadFrequently: true })
  if (!ctx) return false
  ctx.drawImage(source, 0, 0, srcW, srcH, 0, 0, SAMPLE, SAMPLE)
  try {
    const { data } = ctx.getImageData(0, 0, SAMPLE, SAMPLE)
    return analisarEscudoCircularDeImageData(data)
  } catch {
    return false
  }
}

/** Amostra 64×64 — barato o bastante para rodar em todo upload de imagem. */
export function precisaTratarFundoEscudo(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
): boolean {
  return analisarSourceAmostrado(source, srcW, srcH)
}

export function aplicarMascaraCircularNoCanvas(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  aplicarMascaraCircularEmImageData(imageData.data, canvas.width, canvas.height)
  ctx.putImageData(imageData, 0, 0)
}

/**
 * Se o canvas for badge redondo com fundo opaco assado, fura os cantos
 * (alpha 0) e devolve true — o caller deve exportar PNG.
 */
export function tratarFundoEscudoNoCanvas(canvas: HTMLCanvasElement): boolean {
  if (!analisarSourceAmostrado(canvas, canvas.width, canvas.height)) return false
  aplicarMascaraCircularNoCanvas(canvas)
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

const STORAGE_KEY = 'torcida.escudoCircular.v2'
const MAX_CACHE_ENTRIES = 200
const cacheMemoria = new Map<string, boolean>()
const inflight = new Map<string, Promise<boolean>>()

type EscudoCircularListener = (url: string, valor: boolean) => void
const listeners = new Set<EscudoCircularListener>()

/** Notifica todos os consumidores quando o cache de uma URL muda. */
export function subscribeEscudoCircular(listener: EscudoCircularListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function lerStorage(): Record<string, boolean> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as Record<string, boolean>
  } catch {
    return {}
  }
}

function gravarStorage(url: string, valor: boolean) {
  if (typeof window === 'undefined') return
  try {
    const all = lerStorage()
    all[url] = valor
    const keys = Object.keys(all)
    if (keys.length > MAX_CACHE_ENTRIES) {
      for (const k of keys.slice(0, keys.length - MAX_CACHE_ENTRIES)) {
        delete all[k]
      }
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    // quota / modo privado
  }
}

/** Leitura síncrona — memória primeiro, depois localStorage. */
export function lerCacheEscudoCircular(url: string): boolean | null {
  if (!url) return null
  const mem = cacheMemoria.get(url)
  if (mem !== undefined) return mem
  const stored = lerStorage()[url]
  if (typeof stored !== 'boolean') return null
  cacheMemoria.set(url, stored)
  return stored
}

export function gravarCacheEscudoCircular(url: string, valor: boolean) {
  if (!url) return
  cacheMemoria.set(url, valor)
  gravarStorage(url, valor)
  for (const listener of listeners) listener(url, valor)
}

export function limparCacheEscudoCircular() {
  cacheMemoria.clear()
  inflight.clear()
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

async function detectarEscudoCircularUncached(url: string): Promise<boolean> {
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
    // Se leu pixels e disse false, confiar (não é circular com fundo).
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

/**
 * Carrega a URL e decide se deve aplicar máscara circular.
 * Resultado fica em memória + localStorage — reload e troca de canal
 * não reprocessam a mesma URL.
 */
export async function detectarEscudoCircular(url: string): Promise<boolean> {
  if (typeof window === 'undefined' || !url) return false

  const cached = lerCacheEscudoCircular(url)
  if (cached !== null) return cached

  const pending = inflight.get(url)
  if (pending) return pending

  const job = detectarEscudoCircularUncached(url)
    .then((resultado) => {
      gravarCacheEscudoCircular(url, resultado)
      inflight.delete(url)
      return resultado
    })
    .catch((err: unknown) => {
      inflight.delete(url)
      throw err
    })

  inflight.set(url, job)
  return job
}
