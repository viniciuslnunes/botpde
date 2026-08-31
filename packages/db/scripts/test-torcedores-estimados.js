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
    // Flamengo está nas DUAS bases. Desde 2026-08-27 a pesquisa ganha do IBOPE:
    // Datafolha mede torcedor, IBOPE mede seguidor de rede social.
    nome: 'Flamengo',
    uf: 'RJ',
    tipo: 'PESQUISA',
    minValor: 30_000_000,
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

// A precedência é o ponto: o mesmo clube tem número nas duas bases e elas medem
// coisas diferentes. Se isso inverter, o card do onboarding passa a anunciar
// seguidor como se fosse torcedor.
const flamengo = resolverTorcedoresEstimados(chaveGrupoClube('Flamengo', 'RJ'))
assert.equal(flamengo.tipo, 'PESQUISA', 'pesquisa ganha do IBOPE')
assert.match(flamengo.fonte, /Datafolha/, 'fonte da pesquisa é citada')

// Clube de 1–2% na pesquisa fica com a ressalva da margem de erro na fonte.
const remo = resolverTorcedoresEstimados(chaveGrupoClube('Remo', 'PA'))
assert.equal(remo.tipo, 'PESQUISA', 'Remo entrou no recorte da pesquisa')
assert.match(remo.fonte, /margem/, 'ressalva de margem na fonte')

console.log(`✓ ${casos.length} casos resolverTorcedoresEstimados (menor IBOPE: ${menorIbope.toLocaleString('pt-BR')})`)
