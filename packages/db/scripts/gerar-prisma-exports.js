#!/usr/bin/env node
/**
 * Gera `src/prisma-exports.js` — a reexportação NOMEADA de tudo que
 * `@prisma/client` expõe.
 *
 * Por que existe: `export * from '@prisma/client'` fazia o Turbopack emitir
 * "unexpected export *" para cada módulo da cadeia (127 avisos por recompilação
 * neste repo, afogando o log de dev) e gerar código de resolução em runtime,
 * porque o client do Prisma é CommonJS e seus nomes só existem em runtime. Com
 * a lista explícita o bundler resolve tudo estaticamente: os avisos somem e o
 * ciclo de edição em dev caiu ~9% na medição.
 *
 * A lista NÃO é escrita à mão. Ela sai do próprio client já gerado, então
 * acompanha o schema automaticamente — `prisma generate` e este script andam
 * juntos em `db:generate` e no `postinstall`.
 *
 *   node scripts/gerar-prisma-exports.js           # regrava o arquivo
 *   node scripts/gerar-prisma-exports.js --check   # exit 1 se estiver defasado
 *
 * O CI roda `db:generate` e depois `git diff --exit-code` no arquivo: se o
 * commitado divergir do que o schema atual produz, o build para com o diff à
 * vista. Ver docs/ops/dev-local-performance.md.
 */
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const aqui = dirname(fileURLToPath(import.meta.url))
const destino = join(aqui, '..', 'src', 'prisma-exports.js')
const destinoTipos = join(aqui, '..', 'src', 'prisma-exports.d.ts')

/**
 * O `.js` só pode reexportar o que existe EM RUNTIME (`Object.keys`) — listar
 * um nome que o CJS não expõe é erro de link do ESM, não erro de tipo. Mas o
 * app importa muito tipo puro do Prisma (`import type { Tenant }`), que só
 * existe no `.d.ts` e portanto nunca apareceria naquela lista.
 *
 * Daí os dois arquivos: valores explícitos no `.js` (o que o bundler lê, e o
 * motivo de tudo isto) e `export *` no `.d.ts`, que é apagado na compilação e
 * o Turbopack nem chega a abrir. O TS prefere o `.d.ts`; o runtime, o `.js`.
 */
const TIPOS = `// GERADO por scripts/gerar-prisma-exports.js — não editar à mão.
//
// Só tipos: some na compilação, então o \`export *\` aqui não custa nada ao
// bundler. Ele existe porque o .js irmão só reexporta valores de runtime, e
// tipos puros do Prisma (\`Tenant\`, \`Alianca\`, …) não estão entre eles.
export * from '@prisma/client'
`

const CABECALHO = `// GERADO por scripts/gerar-prisma-exports.js — não editar à mão.
// Regerar com: pnpm --filter @torcida/db db:generate
//
// Reexporta \`@prisma/client\` por nome em vez de \`export *\`. O client é CJS, e
// o \`export *\` obrigava o Turbopack a resolver os nomes em runtime — 127 avisos
// por recompilação e código extra em cada módulo da cadeia.
`

function montar() {
  let client
  try {
    client = require('@prisma/client')
  } catch (erro) {
    console.error('')
    console.error('  Não consegui carregar @prisma/client.')
    console.error('  Rode `prisma generate` antes deste script.')
    console.error('')
    throw erro
  }

  const nomes = Object.keys(client).sort()
  if (nomes.length === 0) {
    throw new Error('@prisma/client não expôs nenhum nome — client gerado pela metade?')
  }

  const linhas = nomes.map((n) => `  ${n},`).join('\n')
  return `${CABECALHO}\nexport {\n${linhas}\n} from '@prisma/client'\n`
}

const conteudo = montar()
// `$Enums` começa com cifrão — contar só `\w` deixaria um nome de fora.
const total = conteudo.split('\n').filter((l) => /^ {2}[$\w]/.test(l)).length

function ler(caminho) {
  try {
    return readFileSync(caminho, 'utf8')
  } catch {
    return ''
  }
}

if (process.argv.includes('--check')) {
  const defasado =
    (ler(destino) !== conteudo && 'src/prisma-exports.js') ||
    (ler(destinoTipos) !== TIPOS && 'src/prisma-exports.d.ts')
  if (defasado) {
    console.error('')
    console.error(`  ${defasado} está defasado em relação ao schema.`)
    console.error('  Rode: pnpm --filter @torcida/db db:generate  (e commite o diff)')
    console.error('')
    process.exit(1)
  }
  console.log(`  prisma-exports em dia (${total} nomes).`)
  process.exit(0)
}

writeFileSync(destino, conteudo)
writeFileSync(destinoTipos, TIPOS)
console.log(`  src/prisma-exports.js (${total} nomes) + .d.ts gerados.`)
