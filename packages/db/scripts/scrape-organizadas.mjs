/**
 * Scraper do catálogo nacional de torcidas organizadas (organizadasbrasil.com).
 *
 * Varre as 27 páginas por estado, faz parsing determinístico dos cards
 * (rótulos Nome/Time/Fundação/Sede/Sub-sedes/Lema/Site oficial + logo) e grava
 * o dataset versionado `src/data/torcidas-conhecidas.js` (fonte da verdade do
 * seed) + um resumo `torcidas-conhecidas.stats.json`.
 *
 * REQUER REDE — roda na máquina do usuário, não no CI:
 *   pnpm --filter @torcida/db scrape:organizadas
 *   pnpm --filter @torcida/db scrape:organizadas -- --dry-run   (não grava arquivo)
 *
 * Não sobe imagens: apenas coleta a URL do logo. O upload ao Cloudinary é do
 * seed (`seed-torcidas.js`). Fonte colaborativa — tratar como referência a
 * confirmar (datas/grafias variam; há torcidas extintas/renomeadas).
 */
import { writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = resolve(__dir, '../src/data')
const BASE = 'https://organizadasbrasil.com'
const DRY_RUN = process.argv.includes('--dry-run')

/** slug da página → { uf, estado } */
const ESTADOS = [
  ['acre', 'AC', 'Acre'],
  ['alagoas', 'AL', 'Alagoas'],
  ['amapa', 'AP', 'Amapá'],
  ['amazonas', 'AM', 'Amazonas'],
  ['bahia', 'BA', 'Bahia'],
  ['ceara', 'CE', 'Ceará'],
  ['distrito-federal', 'DF', 'Distrito Federal'],
  ['espirito-santo', 'ES', 'Espírito Santo'],
  ['goias', 'GO', 'Goiás'],
  ['maranhao', 'MA', 'Maranhão'],
  ['mato-grosso', 'MT', 'Mato Grosso'],
  ['mato-grosso-do-sul', 'MS', 'Mato Grosso do Sul'],
  ['minas-gerais', 'MG', 'Minas Gerais'],
  ['para', 'PA', 'Pará'],
  ['paraiba', 'PB', 'Paraíba'],
  ['parana', 'PR', 'Paraná'],
  ['pernambuco', 'PE', 'Pernambuco'],
  ['piaui', 'PI', 'Piauí'],
  ['rio-de-janeiro', 'RJ', 'Rio de Janeiro'],
  ['rio-grande-do-norte', 'RN', 'Rio Grande do Norte'],
  ['rio-grande-do-sul', 'RS', 'Rio Grande do Sul'],
  ['rondonia', 'RO', 'Rondônia'],
  ['roraima', 'RR', 'Roraima'],
  ['santa-catarina', 'SC', 'Santa Catarina'],
  ['sao-paulo', 'SP', 'São Paulo'],
  ['sergipe', 'SE', 'Sergipe'],
  ['tocantins', 'TO', 'Tocantins'],
]

const ENTIDADES = {
  '&amp;': '&',
  '&quot;': '"',
  '&#34;': '"',
  '&apos;': "'",
  '&#39;': "'",
  '&lt;': '<',
  '&gt;': '>',
  '&nbsp;': ' ',
  '&ordf;': 'ª',
  '&ordm;': 'º',
}

/** Decodifica entidades comuns e normaliza espaços. */
function limpar(texto) {
  if (texto == null) return null
  let t = texto
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, (m) => ENTIDADES[m] ?? m)
    .replace(/\s+/g, ' ')
    .trim()
  // Valores vazios da fonte
  if (!t || t === '---' || /^n[ãa]o dispon[íi]vel$/i.test(t) || t === '-') return null
  return t
}

/** Remove aspas externas do lema. */
function limparLema(v) {
  const t = limpar(v)
  if (!t) return null
  return t.replace(/^["'“”]+|["'“”]+$/g, '').trim() || null
}

/** Normaliza rótulo para chave (sem acento, minúsculo). */
function chaveRotulo(rot) {
  return rot
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

const MAPA_ROTULO = {
  nome: 'nome',
  time: 'clubeNomeOriginal',
  fundacao: 'fundacao',
  sede: 'sede',
  'sub-sedes': 'subsedes',
  subsedes: 'subsedes',
  lema: 'lema',
  'site oficial': 'siteOficial',
  site: 'siteOficial',
}

/** Extrai a cidade da Sede (heurística: penúltimo segmento antes da UF). */
function cidadeDaSede(sede, uf) {
  if (!sede) return null
  // Segmenta por " - " e ", "
  const partes = sede
    .split(/\s*[-–]\s*|,\s*/)
    .map((p) => p.trim())
    .filter(Boolean)
  if (partes.length === 0) return null
  // Remove a UF final se presente
  const semUf = partes.filter((p) => p.toUpperCase() !== uf)
  const ultima = semUf[semUf.length - 1]
  if (!ultima) return null
  // Evita capturar CEP/estádios/números como cidade
  if (/\d/.test(ultima) && !/^\d+$/.test(ultima)) return ultima.length <= 40 ? ultima : null
  return ultima.length <= 40 ? ultima : null
}

/** Faz parsing de uma página de estado. Retorna array de torcidas. */
function parsePagina(html, uf, estado, fonteUrl) {
  const torcidas = []
  // Cada card é um <div class="... torcida"> ... </div>
  const cards = html.split(/<div class="[^"]*\btorcida">/i).slice(1)
  for (const card of cards) {
    if (!/<strong>\s*Nome\s*:/i.test(card)) continue

    const logoMatch = card.match(/\/imagens\/simbolos\/(obr_[^"?.]+)\.(gif|png|jpg|jpeg)/i)
    const logoUrl = logoMatch
      ? `${BASE}/imagens/simbolos/${logoMatch[1]}.${logoMatch[2]}`
      : null

    const perfilMatch = card.match(/href="(\/torcida\/[^"]+\.html)"/i)
    const perfilUrl = perfilMatch ? `${BASE}${perfilMatch[1]}` : fonteUrl

    /** @type {Record<string, string|null>} */
    const campos = {}
    const re = /<strong>\s*([^<:]+?)\s*:\s*<\/strong>\s*<\/div>\s*<div[^>]*>([\s\S]*?)<\/div>/gi
    let m
    while ((m = re.exec(card)) !== null) {
      const chave = MAPA_ROTULO[chaveRotulo(m[1])]
      if (!chave) continue
      campos[chave] = chave === 'lema' ? limparLema(m[2]) : limpar(m[2])
    }

    const nome = campos.nome
    if (!nome) continue

    const sede = campos.sede ?? null
    torcidas.push({
      nome,
      clubeNomeOriginal: campos.clubeNomeOriginal ?? null,
      fundacao: campos.fundacao ?? null,
      sede,
      subsedes: campos.subsedes ?? null,
      lema: campos.lema ?? null,
      siteOficial: campos.siteOficial ?? null,
      cidade: cidadeDaSede(sede, uf),
      uf,
      estado,
      logoUrl,
      fonteUrl: perfilUrl,
    })
  }
  return torcidas
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TorcidaSaaS/1.0; catálogo)' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

async function main() {
  console.log(`Scraper organizadasbrasil.com — ${ESTADOS.length} estados.`)
  if (DRY_RUN) console.log('(dry-run: não grava arquivo)')

  const todas = []
  const stats = {}
  for (const [slug, uf, estado] of ESTADOS) {
    const url = `${BASE}/torcidas-organizadas-${slug}`
    try {
      const html = await fetchHtml(url)
      const lista = parsePagina(html, uf, estado, url)
      todas.push(...lista)
      stats[uf] = lista.length
      console.log(`  ${uf} ${estado.padEnd(20)} ${String(lista.length).padStart(3)} torcidas`)
    } catch (err) {
      stats[uf] = 0
      console.warn(`  ! ${uf} ${estado}: ${err.message}`)
    }
  }

  const comLogo = todas.filter((t) => t.logoUrl).length
  const comLema = todas.filter((t) => t.lema).length
  console.log(`\nTotal: ${todas.length} torcidas | com logo: ${comLogo} | com lema: ${comLema}`)

  if (DRY_RUN) return

  const geradoEm = new Date().toISOString()
  const header = `// GERADO por scripts/scrape-organizadas.mjs — NÃO editar à mão.
// Fonte: organizadasbrasil.com (portal colaborativo). Referência a confirmar:
// datas/grafias variam; há torcidas extintas/renomeadas/banidas. ${todas.length} registros.
// Gerado em ${geradoEm}.
`
  const conteudo = `${header}
/** @typedef {{ nome: string, clubeNomeOriginal: string|null, fundacao: string|null, sede: string|null, subsedes: string|null, lema: string|null, siteOficial: string|null, cidade: string|null, uf: string, estado: string, logoUrl: string|null, fonteUrl: string }} TorcidaConhecidaSeed */

/** @type {TorcidaConhecidaSeed[]} */
export const TORCIDAS_CONHECIDAS = ${JSON.stringify(todas, null, 2)}

export const TORCIDAS_CONHECIDAS_META = ${JSON.stringify(
    { fonte: BASE, geradoEm, total: todas.length, comLogo, porUf: stats },
    null,
    2,
  )}
`
  writeFileSync(resolve(DATA_DIR, 'torcidas-conhecidas.js'), conteudo, 'utf8')
  writeFileSync(
    resolve(DATA_DIR, 'torcidas-conhecidas.stats.json'),
    JSON.stringify({ fonte: BASE, geradoEm, total: todas.length, comLogo, comLema, porUf: stats }, null, 2),
    'utf8',
  )
  console.log(`\n✓ Dataset gravado em src/data/torcidas-conhecidas.js`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
