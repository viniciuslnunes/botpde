#!/usr/bin/env node
/**
 * Higiene do cache de dev do Turbopack.
 *
 * O cache persistente (`.next/dev/cache/turbopack`) é um store LSM: entradas
 * invalidadas viram lixo que só sai em compactação. Em meses de desenvolvimento
 * ele cresce sem teto — neste repo chegou a 70 GB e passou a DOMINAR o tempo de
 * compilação de rota, porque cada build lê e escreve nesse store, num SSD que
 * já estava 94% cheio e com o Defender varrendo cada arquivo .sst.
 *
 *   node scripts/dev-cache.mjs           # mostra o tamanho e avisa se passou do teto
 *   node scripts/dev-cache.mjs --limpar  # apaga .next inteiro
 *
 * Equivalentes: `pnpm --filter @torcida/web dev:cache` e `... dev:clean`.
 */
import { rmSync, statSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const appWeb = join(aqui, '..')
const dirNext = join(appWeb, '.next')

/** Teto a partir do qual o cache passa a atrapalhar mais do que ajuda. */
const LIMITE_GB = 8

function tamanhoBytes(dir) {
  let total = 0
  let arquivos = 0
  const pilha = [dir]
  while (pilha.length > 0) {
    const atual = pilha.pop()
    let entradas
    try {
      entradas = readdirSync(atual, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entradas) {
      const caminho = join(atual, e.name)
      if (e.isDirectory()) {
        pilha.push(caminho)
      } else {
        try {
          total += statSync(caminho).size
          arquivos += 1
        } catch {
          /* arquivo sumiu entre o readdir e o stat */
        }
      }
    }
  }
  return { total, arquivos }
}

const gb = (b) => b / 1024 ** 3

function existe(p) {
  try {
    statSync(p)
    return true
  } catch {
    return false
  }
}

const limpar = process.argv.includes('--limpar')

if (!existe(dirNext)) {
  console.log('  .next não existe — nada a fazer.')
  process.exit(0)
}

if (limpar) {
  const { total } = tamanhoBytes(dirNext)
  const t0 = Date.now()
  rmSync(dirNext, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  const s = ((Date.now() - t0) / 1000).toFixed(0)
  console.log(`  .next apagado — ${gb(total).toFixed(1)} GB liberados em ${s}s.`)
  console.log('  A próxima subida é fria; da segunda em diante o cache já ajuda.')
  process.exit(0)
}

const geral = tamanhoBytes(dirNext)
const dirCache = join(dirNext, 'dev', 'cache', 'turbopack')
const cache = existe(dirCache) ? tamanhoBytes(dirCache) : { total: 0, arquivos: 0 }

console.log('')
console.log(
  `  .next                       ${gb(geral.total).toFixed(1).padStart(7)} GB  (${geral.arquivos} arquivos)`,
)
console.log(
  `  .next/dev/cache/turbopack   ${gb(cache.total).toFixed(1).padStart(7)} GB  (${cache.arquivos} arquivos)`,
)
console.log('')

if (gb(geral.total) > LIMITE_GB) {
  console.log(`  Acima do teto de ${LIMITE_GB} GB — o cache já está cobrando mais do que rende.`)
  console.log('  Rode: pnpm --filter @torcida/web dev:clean')
  console.log('')
  process.exit(1)
}

console.log('  Tamanho saudável.')
console.log('')
