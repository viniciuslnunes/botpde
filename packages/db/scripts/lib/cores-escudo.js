/**
 * Regras puras de extração de cor do escudo — separadas do script de coleta
 * para poderem ser testadas sem rede, Cloudinary ou banco
 * (`scripts/test-catalogo-clubes.js`).
 *
 * Limite conhecido, e por isso o resultado é PROPOSTA: a ordem sai da área que
 * a cor ocupa na imagem, não da identidade do clube — num escudo preto e branco
 * o branco pode vir primeiro. Curadoria (`CLUBE_PALETAS`) sempre ganha.
 */

/** Participação mínima da cor na imagem para entrar na paleta (%). */
export const PARTICIPACAO_MINIMA = 3
/** Máximo de cores por clube (primária, secundária, um acento). */
export const MAX_CORES = 3
/** Distância euclidiana RGB abaixo da qual duas cores viram a mesma. */
export const DISTANCIA_FUSAO = 60

/**
 * `https://res.cloudinary.com/<cloud>/image/upload/v123/pasta/arquivo.png`
 * → `pasta/arquivo` (public_id, sem versão e sem extensão).
 * @param {string} url
 * @returns {string | null}
 */
export function publicIdDaUrl(url) {
  const m = /\/image\/upload\/(?:v\d+\/)?(.+)$/.exec(url ?? '')
  if (!m) return null
  return m[1].replace(/\.[a-z0-9]+$/i, '')
}

/**
 * @param {string} hex
 * @returns {[number, number, number]}
 */
function paraRgb(hex) {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function distancia(a, b) {
  const [r1, g1, b1] = paraRgb(a)
  const [r2, g2, b2] = paraRgb(b)
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2)
}

/**
 * Funde tons próximos (anti-aliasing), corta ruído e devolve a paleta.
 * @param {[string, number][]} cores pares [hex, participação %] vindos da API
 * @returns {{ hex: string, participacao: number }[]}
 */
export function consolidarCores(cores) {
  /** @type {{ hex: string, participacao: number }[]} */
  const fundidas = []
  for (const [hexBruto, pct] of cores ?? []) {
    if (typeof hexBruto !== 'string' || typeof pct !== 'number') continue
    const hex = hexBruto.toUpperCase()
    const proxima = fundidas.find((c) => distancia(c.hex, hex) < DISTANCIA_FUSAO)
    if (proxima) {
      // A cor dominante do grupo é a de maior participação — o tom mais claro
      // ou mais escuro do anti-aliasing não deve virar a cor do clube.
      if (pct > proxima.participacao) proxima.hex = hex
      proxima.participacao += pct
    } else {
      fundidas.push({ hex, participacao: pct })
    }
  }
  return fundidas
    .filter((c) => c.participacao >= PARTICIPACAO_MINIMA)
    .sort((a, b) => b.participacao - a.participacao)
    .slice(0, MAX_CORES)
    .map((c) => ({ hex: c.hex, participacao: Math.round(c.participacao * 10) / 10 }))
}
