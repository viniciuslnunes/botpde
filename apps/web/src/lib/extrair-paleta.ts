/**
 * Extrai paleta dominante de uma imagem (escudo/logo) via canvas.
 * Roda só no client — CORS-friendly quando a imagem permite.
 */

function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0'))
      .join('')
  )
}

function colorKey(r: number, g: number, b: number, buckets = 16): string {
  const q = (n: number) => Math.round((n / 255) * (buckets - 1)) * Math.round(255 / (buckets - 1))
  return `${q(r)},${q(g)},${q(b)}`
}

function isNearWhite(r: number, g: number, b: number): boolean {
  return r > 245 && g > 245 && b > 245
}

function isNearBlack(r: number, g: number, b: number): boolean {
  return r < 18 && g < 18 && b < 18
}

function saturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b) / 255
  const min = Math.min(r, g, b) / 255
  if (max === min) return 0
  const l = (max + min) / 2
  const d = max - min
  return l > 0.5 ? d / (2 - max - min) : d / (max + min)
}

/**
 * @param url URL absoluta do escudo/logo (precisa CORS se cross-origin)
 * @param maxCores Quantidade de cores a retornar
 */
export async function extrairPaletaDeImagem(
  url: string,
  maxCores = 5,
): Promise<string[]> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const size = 64
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) {
          resolve([])
          return
        }
        ctx.drawImage(img, 0, 0, size, size)
        const { data } = ctx.getImageData(0, 0, size, size)

        /** @type {Map<string, { count: number, r: number, g: number, b: number, sat: number }>} */
        const buckets = new Map()

        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3]
          if (a < 128) continue
          const r = data[i]
          const g = data[i + 1]
          const b = data[i + 2]
          // Ignora quase-transparentes e neutros extremos que poluem escudos.
          if (isNearWhite(r, g, b)) continue
          const key = colorKey(r, g, b)
          const sat = saturation(r, g, b)
          const prev = buckets.get(key)
          if (prev) {
            prev.count += 1
            prev.r += r
            prev.g += g
            prev.b += b
            prev.sat += sat
          } else {
            buckets.set(key, { count: 1, r, g, b, sat })
          }
        }

        const ranked = [...buckets.values()]
          .map((b) => ({
            count: b.count,
            hex: rgbToHex(b.r / b.count, b.g / b.count, b.b / b.count),
            sat: b.sat / b.count,
            // Prefere cores saturadas; pretos/brancos reais ainda entram se forem maioria.
            score: b.count * (1 + b.sat / b.count * 2) * (isNearBlack(b.r / b.count, b.g / b.count, b.b / b.count) ? 0.7 : 1),
          }))
          .sort((a, b) => b.score - a.score)

        const result: string[] = []
        for (const item of ranked) {
          if (result.length >= maxCores) break
          // Evita duplicatas muito próximas
          const tooClose = result.some((hex) => coresProximas(hex, item.hex))
          if (!tooClose) result.push(item.hex)
        }
        resolve(result)
      } catch {
        resolve([])
      }
    }
    img.onerror = () => resolve([])
    img.src = url
  })
}

function coresProximas(a: string, b: string, limiar = 40): boolean {
  const ar = parseInt(a.slice(1, 3), 16)
  const ag = parseInt(a.slice(3, 5), 16)
  const ab = parseInt(a.slice(5, 7), 16)
  const br = parseInt(b.slice(1, 3), 16)
  const bg = parseInt(b.slice(3, 5), 16)
  const bb = parseInt(b.slice(5, 7), 16)
  const dist = Math.sqrt((ar - br) ** 2 + (ag - bg) ** 2 + (ab - bb) ** 2)
  return dist < limiar
}
