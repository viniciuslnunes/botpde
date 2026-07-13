/**
 * Testes do resolver de torcedores estimados (offline).
 * Rode: node packages/db/scripts/test-torcedores-estimados.js
 */
import assert from 'node:assert/strict'
import { chaveGrupoClube } from '../src/data/afiliacoes-normalize.js'
import {
  resolverTorcedoresEstimados,
  LIMITE_TORCEDORES_FORA_IBOPE,
} from '../src/data/torcedores-estimados.js'
import { MENOR_TOTAL_IBOPE_PUBLICADO } from '../src/data/ibope-ranking-digital.js'

const casos = [
  {
    nome: 'Flamengo',
    uf: 'RJ',
    tipo: 'IBOPE_DIGITAL',
    minValor: 67_000_000,
  },
  {
    nome: 'Goiás',
    uf: 'GO',
    tipo: 'IBOPE_DIGITAL',
    minValor: 2_000_000,
  },
  {
    nome: '1° de Maio Esporte Clube',
    uf: 'PE',
    tipo: 'LIMITE_ATE',
    valor: LIMITE_TORCEDORES_FORA_IBOPE,
  },
]

for (const c of casos) {
  const chave = chaveGrupoClube(c.nome, c.uf)
  const r = resolverTorcedoresEstimados(chave)
  assert.equal(r.tipo, c.tipo, `${c.nome}: tipo`)
  if (c.valor != null) assert.equal(r.valor, c.valor, `${c.nome}: valor`)
  if (c.minValor != null) assert.ok(r.valor >= c.minValor, `${c.nome}: min`)
}

console.log(`✓ ${casos.length} casos resolverTorcedoresEstimados`)
