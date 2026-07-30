/**
 * Teste puro (offline, sem rede/DB) do dataset de séries do Brasileirão.
 *   node scripts/test-series-brasileirao.js
 */
import assert from 'node:assert/strict'
import {
  SERIES_BRASILEIRAO_2026,
  SERIES_BRASILEIRAO_2026_CONTAGEM,
} from '../src/data/series-brasileirao-2026.js'
import { chaveGrupoClube, normalizeNome } from '../src/data/afiliacoes-normalize.js'

let passed = 0
function ok(nome, fn) {
  fn()
  passed += 1
  console.log(`  ✓ ${nome}`)
}

ok('contagem por série bate com a invariante (20+20+20+96)', () => {
  /** @type {Record<string, number>} */
  const by = { A: 0, B: 0, C: 0, D: 0 }
  for (const c of SERIES_BRASILEIRAO_2026) {
    by[c.serie] = (by[c.serie] ?? 0) + 1
  }
  assert.deepEqual(by, SERIES_BRASILEIRAO_2026_CONTAGEM)
  assert.equal(SERIES_BRASILEIRAO_2026.length, 156)
})

ok('nenhum clube aparece em duas divisões (chave nome+UF)', () => {
  const vistos = new Map()
  for (const c of SERIES_BRASILEIRAO_2026) {
    const k = chaveGrupoClube(c.nome, c.estado)
    assert.ok(!vistos.has(k), `duplicata: ${k} (${c.serie} e ${vistos.get(k)})`)
    vistos.set(k, c.serie)
  }
})

ok('todo item tem nome, UF de 2 letras e série A|B|C|D', () => {
  for (const c of SERIES_BRASILEIRAO_2026) {
    assert.ok(c.nome?.trim(), 'nome vazio')
    assert.match(c.estado, /^[A-Z]{2}$/)
    assert.ok(['A', 'B', 'C', 'D'].includes(c.serie), `série inválida: ${c.serie}`)
  }
})

ok('clubes grandes da Série A estão presentes', () => {
  const chaves = new Set(SERIES_BRASILEIRAO_2026.map((c) => chaveGrupoClube(c.nome, c.estado)))
  assert.ok(chaves.has(chaveGrupoClube('Corinthians', 'SP')))
  assert.ok(chaves.has(chaveGrupoClube('Flamengo', 'RJ')))
  assert.ok(chaves.has(chaveGrupoClube('Remo', 'PA')))
  const remo = SERIES_BRASILEIRAO_2026.find(
    (c) => chaveGrupoClube(c.nome, c.estado) === chaveGrupoClube('Remo', 'PA'),
  )
  assert.equal(remo?.serie, 'A')
})

ok('Sport (PE) está na Série B e CSA (AL) na D', () => {
  const sport = SERIES_BRASILEIRAO_2026.find((c) => normalizeNome(c.nome) === 'sport')
  const csa = SERIES_BRASILEIRAO_2026.find((c) => normalizeNome(c.nome) === 'csa')
  assert.equal(sport?.serie, 'B')
  assert.equal(csa?.serie, 'D')
})

console.log(`\n${passed} asserções OK — ${SERIES_BRASILEIRAO_2026.length} clubes no dataset.`)
