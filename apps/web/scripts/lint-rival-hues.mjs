/**
 * Invariante: fluxo de tenant (portal/admin) não pinta hue de arquirrival
 * com paleta Tailwind crua. Verde/emerald/lime/teal e azul/sky/indigo/cyan
 * nunca passam por `sanearAcoesContraRivalidade` / `resolverCorSemRivalidade`.
 *
 * Super-admin e testes ficam de fora (plataforma, não a casa da torcida).
 *
 *   node scripts/lint-rival-hues.mjs
 *   node scripts/lint-rival-hues.mjs --ci
 */
import fs from 'node:fs'
import path from 'node:path'

const RAIZ = process.env.LINT_RIVAL_RAIZ ?? path.join(import.meta.dirname, '..', 'src')
const CI = process.argv.includes('--ci')

const UTIL =
  /\b(?:bg|text|border|from|to|via|ring|fill|stroke|outline|decoration|accent|caret|divide|shadow)-(?:green|emerald|lime|teal|sky|blue|indigo|cyan)-[0-9]{2,3}\b/

const PULAR_DIR = new Set(['node_modules', '__tests__', '__audit__', '__seed__', 'super-admin'])

function arquivos(dir) {
  const saida = []
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, item.name)
    if (item.isDirectory()) {
      if (PULAR_DIR.has(item.name)) continue
      saida.push(...arquivos(p))
    } else if (/\.(tsx|ts|css)$/.test(item.name)) {
      saida.push(p)
    }
  }
  return saida
}

const rel = (p) => path.relative(path.join(RAIZ, '..', '..', '..'), p).replace(/\\/g, '/')
const ehComentario = (linha) => /^\s*(\/\/|\*|\/\*)/.test(linha)

const violacoes = []

for (const arquivo of arquivos(RAIZ)) {
  const linhas = fs.readFileSync(arquivo, 'utf-8').split('\n')
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i]
    if (ehComentario(linha)) continue
    const m = linha.match(UTIL)
    if (!m) continue
    violacoes.push({
      arquivo: rel(arquivo),
      linha: i + 1,
      trecho: linha.trim().slice(0, 140),
      token: m[0],
    })
  }
}

if (violacoes.length === 0) {
  console.log('lint-rival-hues: OK — sem paleta Tailwind de arquirrival em portal/admin.')
  process.exit(0)
}

console.log(`\n[rival-hues] ${violacoes.length} classe(s) Tailwind de hue tabu:`)
for (const v of violacoes) {
  console.log(`  ${v.arquivo}:${v.linha}  ${v.token}\n    ${v.trecho}`)
}
console.log(
  '  → use --color-success / --color-info / --color-primary (saneados) ou muted. Ver docs/knowledge/identidade-visual-cores.md',
)
console.log(`\nlint-rival-hues: ${violacoes.length} violacao(oes).`)
process.exit(CI ? 1 : 0)
