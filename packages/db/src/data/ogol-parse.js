/**
 * Parser puro da listagem Ogol (equipes/futebol/brasil).
 * Sem rede — testável offline com fixtures HTML.
 */

/** Exclui feminino, categorias de base e modalidades fora do futebol de campo masculino adulto. */
export const OGOL_EXCLUIR_RE =
  /feminino|feminina|\bfem\b|\bsub[\s-]?\d|\bs\d{1,2}\b|juvenil|mirim|infantil|cadete|pré-juvenil|pre-juvenil|futebol\s*7|futsal|\bbase\b/i

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept-Language': 'pt-BR,pt;q=0.9',
  Accept: 'text/html,application/xhtml+xml',
  Referer: 'https://www.ogol.com.br/',
}

/**
 * @param {string} local Ex.: `Brasil · Rio de Janeiro (RJ) · 1895`
 * @returns {{ cidade: string | null, uf: string | null, fundacao: number | null }}
 */
export function parseOgolLocal(local) {
  if (!local) return { cidade: null, uf: null, fundacao: null }
  const partes = local
    .split('·')
    .map((p) => p.trim())
    .filter(Boolean)
  let cidade = null
  let uf = null
  let fundacao = null

  for (const p of partes) {
    if (/^brasil$/i.test(p)) continue
    const mUf = p.match(/^(.+?)\s*\(([A-Z]{2})\)\s*$/)
    if (mUf) {
      cidade = mUf[1].trim()
      uf = mUf[2]
      continue
    }
    const ano = p.match(/^(\d{4})$/)
    if (ano) fundacao = Number(ano[1])
  }

  return { cidade, uf, fundacao }
}

/**
 * @param {string} html
 * @returns {Array<{ ogolId: string, slug: string, titulo: string | null, nomeOficial: string | null, local: string | null, logoUrl: string, modalidade: string | null }>}
 */
export function parseOgolListagemHtml(html) {
  const partes = html.split('<div class="zz-search-item team')
  /** @type {Array<{ ogolId: string, slug: string, titulo: string | null, nomeOficial: string | null, local: string | null, logoUrl: string, modalidade: string | null }>} */
  const clubes = []

  for (const parte of partes.slice(1)) {
    const chunk = `<div class="zz-search-item team${parte.split('<div class="zz-search-item team')[0]}`
    const ogolId = chunk.match(/data-id="(\d+)"/)?.[1]
    const titulo = chunk.match(/<a class="title"[^>]*>([^<]+)<\/a>/)?.[1]?.trim() ?? null
    const nomeOficial = chunk.match(/<div class="subtitle">([^<]*)<\/div>/)?.[1]?.trim() ?? null
    const logoUrl = chunk.match(
      /src="(https:\/\/cdn-img\.staticzz\.com\/img\/logos\/equipas\/[^"]+)"/,
    )?.[1]
    const local = chunk
      .match(/<div class="local">([\s\S]*?)<\/div>/)?.[1]
      ?.replace(/<[^>]+>/g, '')
      .trim() ?? null
    const slug = chunk.match(/href="\/equipe\/([^?"\/]+)/)?.[1] ?? null
    const modalidade = chunk.match(/zz-icn-mod-(\d+)/)?.[1] ?? null

    if (!ogolId || !logoUrl || !slug) continue
    clubes.push({ ogolId, slug, titulo, nomeOficial, local, logoUrl, modalidade })
  }

  return clubes
}

/**
 * @param {{ titulo?: string | null, nomeOficial?: string | null, slug?: string | null, modalidade?: string | null }} clube
 * @returns {boolean}
 */
export function deveExcluirOgolClube(clube) {
  const texto = [clube.titulo, clube.nomeOficial, clube.slug].filter(Boolean).join(' ')
  if (OGOL_EXCLUIR_RE.test(texto)) return true
  // modalidade 1 = futebol de campo na listagem /equipes/futebol/
  if (clube.modalidade && clube.modalidade !== '1') return true
  return false
}

/**
 * @param {number} page
 * @returns {Promise<{ clubes: ReturnType<typeof normalizarOgolClube>[], vazio: boolean }>}
 */
export async function fetchOgolPagina(page) {
  const url = `https://www.ogol.com.br/equipes/futebol/brasil?page=${page}&order=popular`
  const res = await fetch(url, { headers: FETCH_HEADERS })
  if (!res.ok) throw new Error(`HTTP ${res.status} página ${page}`)
  const html = await res.text()
  const brutos = parseOgolListagemHtml(html)
  const clubes = brutos
    .filter((c) => !deveExcluirOgolClube(c))
    .map((c) => normalizarOgolClube(c, page))
  return { clubes, vazio: brutos.length === 0 }
}

/**
 * @param {{ ogolId: string, slug: string, titulo: string | null, nomeOficial: string | null, local: string | null, logoUrl: string, modalidade: string | null }} bruto
 * @param {number} pagina
 */
export function normalizarOgolClube(bruto, pagina) {
  const { cidade, uf, fundacao } = parseOgolLocal(bruto.local)
  return {
    ogolId: bruto.ogolId,
    slug: bruto.slug,
    titulo: bruto.titulo,
    nomeOficial: bruto.nomeOficial || bruto.titulo,
    cidade,
    uf,
    fundacao,
    logoUrl: bruto.logoUrl,
    pagina,
  }
}
