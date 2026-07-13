/**
 * Coleta / validação mensal do Ranking Digital IBOPE Repucom.
 *
 * Uso:
 *   pnpm --filter @torcida/db coleta:ibope-ranking -- --validate
 *   pnpm --filter @torcida/db coleta:ibope-ranking -- --import=entrada.json
 *   pnpm --filter @torcida/db coleta:ibope-ranking -- --import=entrada.json --dry-run
 *
 * Formato de entrada (`--import`):
 * {
 *   "edicaoReferencia": "2026-07",
 *   "clubes": [
 *     { "chave": "flamengo|rj", "inscritos": 67554417, "posicao": 1, "edicao": "2026-07" }
 *   ],
 *   "top50SemTotal": []
 * }
 *
 * `chave` = `chaveGrupoClube(nome, uf)` (ver afiliacoes-normalize.js).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chaveGrupoClube } from '../src/data/afiliacoes-normalize.js'
import {
  IBOPE_RANKING_DIGITAL,
  CHAVES_IBOPE_TOP50_SEM_TOTAL,
  posicoesIbopeSemClube,
} from '../src/data/ibope-ranking-digital.js'

const __dir = dirname(fileURLToPath(import.meta.url))
const DATA_PATH = resolve(__dir, '../src/data/ibope-ranking-digital.json')

function argValue(flag) {
  const hit = process.argv.find((a) => a.startsWith(`--${flag}=`))
  return hit ? hit.split('=').slice(1).join('=') : null
}

function hasFlag(flag) {
  return process.argv.includes(`--${flag}`)
}

function validarEntrada(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('JSON inválido')
  if (!Array.isArray(payload.clubes)) throw new Error('Campo "clubes" obrigatório (array)')
  for (const row of payload.clubes) {
    if (!row.chave || typeof row.chave !== 'string') {
      throw new Error('Cada clube precisa de "chave"')
    }
    if (!Number.isFinite(row.inscritos) || row.inscritos <= 0) {
      throw new Error(`Inscritos inválidos para ${row.chave}`)
    }
    if (row.posicao != null && (!Number.isInteger(row.posicao) || row.posicao < 1 || row.posicao > 50)) {
      throw new Error(`Posição inválida para ${row.chave}`)
    }
    if (!row.edicao || typeof row.edicao !== 'string') {
      throw new Error(`Edição inválida para ${row.chave}`)
    }
  }
}

function mesclarClubes(atuais, novos) {
  const map = new Map(atuais.map((c) => [c.chave, { ...c }]))
  for (const row of novos) {
    map.set(row.chave, {
      chave: row.chave,
      inscritos: row.inscritos,
      posicao: row.posicao ?? null,
      edicao: row.edicao,
    })
  }
  return [...map.values()].sort((a, b) => {
    if (a.posicao != null && b.posicao != null) return a.posicao - b.posicao
    if (a.posicao != null) return -1
    if (b.posicao != null) return 1
    return b.inscritos - a.inscritos
  })
}

function validar() {
  const comTotal = IBOPE_RANKING_DIGITAL.length
  const semTotal = CHAVES_IBOPE_TOP50_SEM_TOTAL.size
  const posFaltantes = posicoesIbopeSemClube()
  const duplicatasPos = new Map()
  for (const row of IBOPE_RANKING_DIGITAL) {
    if (row.posicao == null) continue
    const prev = duplicatasPos.get(row.posicao) ?? []
    prev.push(row.chave)
    duplicatasPos.set(row.posicao, prev)
  }
  const posDuplicadas = [...duplicatasPos.entries()].filter(([, chaves]) => chaves.length > 1)

  console.log('=== IBOPE Ranking Digital — validação ===')
  console.log(`Clubes com total: ${comTotal}`)
  console.log(`Top 50 sem total (piso): ${semTotal}`)
  console.log(`Posições 1–50 sem clube: ${posFaltantes.length ? posFaltantes.join(', ') : 'nenhuma'}`)
  if (posDuplicadas.length) {
    console.log('⚠ Posições duplicadas:')
    for (const [pos, chaves] of posDuplicadas) {
      console.log(`  ${pos}º → ${chaves.join(', ')}`)
    }
  } else {
    console.log('Posições duplicadas: nenhuma')
  }

  const exemplos = [
    ['Flamengo', 'RJ'],
    ['Goiás', 'GO'],
    ['1° de Maio Esporte Clube', 'PE'],
  ]
  console.log('\nCasamento chaveGrupoClube (amostra):')
  for (const [nome, uf] of exemplos) {
    console.log(`  ${nome} (${uf}) → ${chaveGrupoClube(nome, uf)}`)
  }
}

function importar() {
  const path = argValue('import')
  if (!path) {
    console.error('Use --import=caminho/entrada.json')
    process.exit(1)
  }
  const raw = readFileSync(resolve(path), 'utf8')
  const entrada = JSON.parse(raw)
  validarEntrada(entrada)

  const atual = JSON.parse(readFileSync(DATA_PATH, 'utf8'))
  const mesclado = {
    edicaoReferencia: entrada.edicaoReferencia ?? atual.edicaoReferencia,
    clubes: mesclarClubes(atual.clubes ?? [], entrada.clubes),
    top50SemTotal: entrada.top50SemTotal ?? atual.top50SemTotal ?? [],
  }

  console.log(`Importação: +${entrada.clubes.length} linhas → ${mesclado.clubes.length} clubes no JSON`)

  if (hasFlag('dry-run')) {
    console.log('(dry-run — JSON não gravado)')
    return
  }

  writeFileSync(DATA_PATH, `${JSON.stringify(mesclado, null, 2)}\n`, 'utf8')
  console.log(`✓ Gravado ${DATA_PATH}`)
  console.log('Rode: pnpm --filter @torcida/db test:torcedores-estimados')
  console.log('      pnpm --filter @torcida/db seed:torcedores-estimados')
}

if (hasFlag('import') || argValue('import')) {
  importar()
} else {
  validar()
}
