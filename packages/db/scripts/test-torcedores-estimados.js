/**
 * Testes do resolver de torcedores estimados (offline).
 * Rode: node packages/db/scripts/test-torcedores-estimados.js
 */
import assert from 'node:assert/strict'
import { chaveGrupoClube } from '../src/data/afiliacoes-normalize.js'
import {
  resolverTorcedoresEstimados,
  calcularMenorValorEstimadosConhecido,
} from '../src/data/torcedores-estimados.js'

const menorIbope = calcularMenorValorEstimadosConhecido()

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
    valor: menorIbope,
  },
]

for (const c of casos) {
  const chave = chaveGrupoClube(c.nome, c.uf)
  const r = resolverTorcedoresEstimados(chave)
  assert.equal(r.tipo, c.tipo, `${c.nome}: tipo`)
  if (c.valor != null) assert.equal(r.valor, c.valor, `${c.nome}: valor`)
  if (c.minValor != null) assert.ok(r.valor >= c.minValor, `${c.nome}: min`)
}

assert.ok(menorIbope > 0, 'menor IBOPE > 0')
assert.notEqual(menorIbope, 10_000, 'teto LIMITE não é mais 10 mil fixo')

console.log(`✓ ${casos.length} casos resolverTorcedoresEstimados (menor IBOPE: ${menorIbope.toLocaleString('pt-BR')})`)
