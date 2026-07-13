/**
 * Coleta o catálogo Ogol de clubes de futebol masculinos no Brasil.
 *
 * Varre /equipes/futebol/brasil?page=1…506 (para em página vazia), exclui
 * feminino/categorias de base e grava `src/data/ogol-clubes-brasil.json`.
 *
 *   pnpm --filter @torcida/db coleta:ogol-clubes
 *   pnpm --filter @torcida/db coleta:ogol-clubes -- --page-from=1 --page-to=10
 *
 * REQUER REDE — não roda no CI.
 */
import { writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchOgolPagina } from '../src/data/ogol-parse.js'

const __dir = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(__dir, '../src/data/ogol-clubes-brasil.json')
const DELAY_MS = 100

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function argNum(flag, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${flag}=`))
  if (!hit) return fallback
  const n = Number(hit.split('=')[1])
  return Number.isFinite(n) ? n : fallback
}

async function main() {
  const pageFrom = argNum('page-from', 1)
  const pageTo = argNum('page-to', 506)
  const delay = argNum('delay', DELAY_MS)

  console.log(`Coleta Ogol — páginas ${pageFrom}…${pageTo} (delay ${delay}ms)`)

  /** @type {Map<string, import('../src/data/ogol-parse.js').normalizarOgolClube extends (...args: any) => infer R ? R : never>} */
  const porId = new Map()
  let paginasVazias = 0

  for (let page = pageFrom; page <= pageTo; page += 1) {
    const { clubes, vazio } = await fetchOgolPagina(page)
    if (vazio) {
      paginasVazias += 1
      console.log(`  página ${page}: vazia — fim`)
      if (paginasVazias >= 1) break
      continue
    }
    paginasVazias = 0
    let novos = 0
    for (const c of clubes) {
      if (!porId.has(c.ogolId)) {
        porId.set(c.ogolId, c)
        novos += 1
      }
    }
    console.log(`  página ${page}: ${clubes.length} itens, +${novos} novos (total ${porId.size})`)
    await sleep(delay)
  }

  const clubes = [...porId.values()].sort((a, b) =>
    (a.nomeOficial ?? a.titulo ?? '').localeCompare(b.nomeOficial ?? b.titulo ?? '', 'pt-BR'),
  )

  const catalogo = {
    geradoEm: new Date().toISOString(),
    fonte: 'https://www.ogol.com.br/equipes/futebol/brasil',
    paginaInicio: pageFrom,
    paginaFim: pageTo,
    total: clubes.length,
    clubes,
  }

  writeFileSync(OUT, JSON.stringify(catalogo, null, 2), 'utf8')
  console.log(`\nCatálogo: ${OUT}`)
  console.log(`  clubes únicos: ${clubes.length}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
