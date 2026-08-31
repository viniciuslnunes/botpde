/**
 * Lint estatico de responsividade mobile — roda no CI, sem servidor nem banco.
 *
 * A auditoria de tela (`e2e/responsivo.measure.ts`) e profunda mas cara: pede
 * app de pe, banco e sessao. Estas duas regras pegam as regressoes que mais
 * doem em telefone e sao decidiveis so lendo o codigo, entao viram invariante
 * de CI — no espirito dos `audit:*` do repo.
 *
 *   node scripts/lint-mobile.mjs          # relatorio
 *   node scripts/lint-mobile.mjs --ci     # exit 1 se houver violacao
 */
import fs from 'node:fs'
import path from 'node:path'

/** Sobrescrevivel para dar pra testar o lint contra um fixture. */
const RAIZ = process.env.LINT_MOBILE_RAIZ ?? path.join(import.meta.dirname, '..', 'src')
const CI = process.argv.includes('--ci')

/** Formas aceitas de reservar o inset inferior. */
const TEM_INSET = /env\(safe-area-inset-bottom\)|\bpb-safe\b|\bsafe-bottom\b/

/** Breakpoints onde a barra dinamica do navegador movel nao existe. */
const PREFIXO_DESKTOP = /^(lg|xl|2xl):/

function arquivos(dir) {
  const saida = []
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, item.name)
    if (item.isDirectory()) {
      if (item.name === 'node_modules' || item.name === '__tests__') continue
      saida.push(...arquivos(p))
    } else if (item.name.endsWith('.tsx')) {
      saida.push(p)
    }
  }
  return saida
}

/** Extrai o bloco de classes ao redor de um indice, respeitando multilinha. */
function blocoDeClasses(texto, idx) {
  const ini = Math.max(0, texto.lastIndexOf('className', idx))
  const fim = texto.indexOf('\n\n', idx)
  return texto.slice(ini, fim === -1 ? Math.min(texto.length, idx + 600) : fim)
}

const rel = (p) => path.relative(path.join(RAIZ, '..', '..', '..'), p).replace(/\\/g, '/')
const ehComentario = (linha) => /^\s*(\/\/|\*|\/\*)/.test(linha)

/**
 * Regra 4 (fora do tema mobile, mas sem casa melhor e barata de rodar aqui):
 * comentario `///` do Prisma que contenha a sequencia que FECHA um bloco
 * JSDoc. O Prisma copia esses comentarios para `index.d.ts` dentro de um
 * bloco, entao a sequencia encerra o comentario no meio, o resto do arquivo
 * vira codigo e o `tsc` quebra com erros absurdos ("Unterminated regular
 * expression literal") a dezenas de milhares de linhas da causa.
 * Aconteceu de verdade: um comentario com um curinga de data derrubou o
 * typecheck inteiro.
 */
function conferirSchemaPrisma() {
  const schema = path.join(RAIZ, '..', '..', '..', 'packages', 'db', 'prisma', 'schema.prisma')
  if (!fs.existsSync(schema)) return []
  const achados = []
  const linhas = fs.readFileSync(schema, 'utf-8').split('\n')
  const fechaJsdoc = new RegExp('\\*' + '/')
  for (let i = 0; i < linhas.length; i++) {
    if (!/^\s*\/\/\//.test(linhas[i])) continue
    if (!fechaJsdoc.test(linhas[i])) continue
    achados.push({
      arquivo: 'packages/db/prisma/schema.prisma',
      linha: i + 1,
      trecho: linhas[i].trim().slice(0, 120),
    })
  }
  return achados
}

const violacoes = { safeArea: [], viewportUnit: [], insetLateral: [], schemaJsdoc: conferirSchemaPrisma() }

for (const arquivo of arquivos(RAIZ)) {
  const texto = fs.readFileSync(arquivo, 'utf-8')
  const linhas = texto.split('\n')

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i]
    if (ehComentario(linha)) continue

    // ── Regra 1: barra fixa de rodape reserva o inset inferior ───────────
    // No iPhone o home indicator come 34px. Sem reservar, o conteudo da barra
    // (tipicamente o CTA) fica embaixo da barra do sistema.
    // So `fixed`: `sticky bottom-0` ancora no container de rolagem, nao na
    // tela — quem responde por ele e o container (nos modais, o painel).
    if (/\bbottom-0\b/.test(linha) && /\bfixed\b/.test(linha)) {
      // `inset-x-0 bottom-0 top-N` e painel de altura cheia (drawer), nao
      // barra de rodape — o inset dele e responsabilidade do conteudo.
      const painelInteiro = /\btop-\d/.test(linha) || /\binset-0\b/.test(linha)
      if (!painelInteiro && !TEM_INSET.test(blocoDeClasses(texto, texto.indexOf(linha)))) {
        violacoes.safeArea.push({ arquivo: rel(arquivo), linha: i + 1, trecho: linha.trim().slice(0, 120) })
      }
    }

    // ── Regra 3: barra de tela cheia reserva o recorte lateral ───────────
    // Com `viewportFit: 'cover'` a pagina ocupa a tela toda; em paisagem o
    // notch come ~44px de um dos lados e `px-4` (16px) esconde o conteudo
    // embaixo dele. Barra `fixed`/`sticky` vive fora do `.app-container`,
    // entao precisa do proprio inset — `.app-inset-x` resolve.
    if (/\binset-x-0\b/.test(linha) && /\bfixed\b/.test(linha)) {
      // Painel de altura cheia (`top-N`) e drawer: quem encosta na lateral e o
      // conteudo dele, nao a moldura — mesma excecao da regra 1.
      const painelInteiro = /\btop-\d/.test(linha) || /\binset-0\b/.test(linha)
      // Padding da PROPRIA linha: `blocoDeClasses` vaza para os filhos e faria
      // uma moldura sem padding herdar o `px-4` de um neto.
      const temPaddingX = /\bp-\d|\bpx-\d|\bpl-\d|\bpr-\d/.test(linha)
      const temInsetX = /app-inset-x|safe-area-inset-left|safe-area-inset-right/.test(linha)
      if (!painelInteiro && temPaddingX && !temInsetX) {
        violacoes.insetLateral.push({
          arquivo: rel(arquivo),
          linha: i + 1,
          trecho: linha.trim().slice(0, 120),
        })
      }
    }

    // ── Regra 2: altura de viewport usa `dvh`, nao `vh` ──────────────────
    // `100vh` no mobile e a viewport COM a barra do navegador retraida: e
    // maior que a area visivel quando a barra esta aberta, entao o rodape da
    // tela fica inalcancavel. `dvh` acompanha a barra.
    for (const token of linha.split(/[\s"'`{}]+/)) {
      if (!token) continue
      const temVh = /(^|[^d])vh\b/.test(token) || /\bh-screen\b/.test(token)
      if (!temVh) continue
      if (PREFIXO_DESKTOP.test(token)) continue // desktop: vh === dvh
      violacoes.viewportUnit.push({ arquivo: rel(arquivo), linha: i + 1, trecho: token.slice(0, 90) })
    }
  }
}

const total =
  violacoes.safeArea.length +
  violacoes.viewportUnit.length +
  violacoes.insetLateral.length +
  violacoes.schemaJsdoc.length

if (violacoes.safeArea.length) {
  console.log(`\n[safe-area] ${violacoes.safeArea.length} barra(s) fixa(s) de rodape sem inset inferior:`)
  for (const v of violacoes.safeArea) console.log(`  ${v.arquivo}:${v.linha}\n    ${v.trecho}`)
  console.log('  → corrija com padding-bottom: max(<folga>, env(safe-area-inset-bottom))')
}

if (violacoes.viewportUnit.length) {
  console.log(`\n[viewport] ${violacoes.viewportUnit.length} altura(s) em vh fora de breakpoint desktop:`)
  for (const v of violacoes.viewportUnit) console.log(`  ${v.arquivo}:${v.linha}  ${v.trecho}`)
  console.log('  → troque por dvh (h-dvh, min-h-dvh, [min(70dvh,...)]); vh so com prefixo lg:/xl:')
}

if (violacoes.insetLateral.length) {
  console.log(
    `\n[inset-lateral] ${violacoes.insetLateral.length} barra(s) de tela cheia sem recorte lateral:`,
  )
  for (const v of violacoes.insetLateral) console.log(`  ${v.arquivo}:${v.linha}\n    ${v.trecho}`)
  console.log('  → troque o px-* por `app-inset-x` (base via [--app-inset-x:<folga>])')
}

if (violacoes.schemaJsdoc.length) {
  console.log(
    `\n[schema-jsdoc] ${violacoes.schemaJsdoc.length} comentario(s) /// do Prisma que fecham o bloco JSDoc:`,
  )
  for (const v of violacoes.schemaJsdoc) console.log(`  ${v.arquivo}:${v.linha}\n    ${v.trecho}`)
  console.log('  → reescreva sem a sequencia; ela quebra o index.d.ts gerado e derruba o tsc')
}

if (total === 0) {
  console.log('lint-mobile: OK — safe-area, viewport, recorte lateral e schema Prisma corretos.')
  process.exit(0)
}

console.log(`\nlint-mobile: ${total} violacao(oes).`)
process.exit(CI ? 1 : 0)
