/**
 * Teste puro (offline, sem rede/DB) da lógica do seed de Afiliacao.
 *   node scripts/test-afiliacoes.js
 * Segue o padrão "script de asserção" — packages/db não usa Vitest.
 */
import assert from 'node:assert/strict'
import {
  normalizeNome,
  chaveMatch,
  gerarSlugUnico,
  indexarLiga,
  casarClube,
  saoMesmoClube,
  chaveGrupoClube,
  inferirUfDoNome,
} from '../src/data/afiliacoes-normalize.js'
import { scoreWikiAfiliacao } from '../src/data/escudos-wiki-match.js'
import { AFILIACOES_BRASIL } from '../src/data/afiliacoes-brasil.js'

let passed = 0
function ok(nome, fn) {
  fn()
  passed += 1
  console.log(`  ✓ ${nome}`)
}

// --- normalização ---
ok('normalizeNome remove acentos e baixa caixa', () => {
  assert.equal(normalizeNome('Grêmio'), 'gremio')
  assert.equal(normalizeNome('São Paulo FC'), 'sao paulo fc')
  assert.equal(normalizeNome('Atlético-MG'), 'atletico mg')
})

ok('chaveMatch remove sufixo UF e ruído (FC/EC/de)', () => {
  assert.equal(chaveMatch('São Paulo FC'), 'sao paulo')
  assert.equal(chaveMatch('Botafogo-SP'), 'botafogo')
  assert.equal(chaveMatch('Athletico-PR'), 'athletico')
  // token distintivo "atletico" preservado
  assert.equal(chaveMatch('Atlético-MG'), 'atletico')
})

ok('saoMesmoClube une Corinthians × nome completo do catálogo', () => {
  assert.equal(
    saoMesmoClube(
      { nome: 'Corinthians', estado: 'SP' },
      { nome: 'Sport Club Corinthians Paulista', estado: 'SP' },
    ),
    true,
  )
  assert.equal(chaveGrupoClube('Corinthians', 'SP'), chaveGrupoClube('Sport Club Corinthians Paulista', 'SP'))
  assert.equal(
    saoMesmoClube({ nome: 'Corinthians', estado: 'SP' }, { nome: 'Vitória', estado: 'BA' }),
    false,
  )
})

// --- unicidade de slug em colisão ---
ok('gerarSlugUnico adiciona sufixo incremental em colisão', () => {
  const usados = new Set()
  const s1 = gerarSlugUnico('Vitória', 'BA', usados)
  const s2 = gerarSlugUnico('Vitória', 'ES', usados) // UF diferente já desambigua
  const s3 = gerarSlugUnico('Vitória', 'BA', usados) // colisão real
  assert.equal(s1, 'vitoria-ba')
  assert.equal(s2, 'vitoria-es')
  assert.equal(s3, 'vitoria-ba-2')
  assert.equal(usados.size, 3)
})

ok('gerarSlugUnico respeita slugs pré-existentes na base', () => {
  const usados = new Set(['flamengo-rj'])
  const s = gerarSlugUnico('Flamengo', 'RJ', usados)
  assert.equal(s, 'flamengo-rj-2')
})

// --- parsing de fixture pequena (sem rede) ---
const FIXTURE = {
  teams: [
    { strTeam: 'Fluminense', strTeamShort: 'FLU', strBadge: 'https://cdn/flu.png', strLocation: 'Rio de Janeiro' },
    { strTeam: 'Athletico Paranaense', strTeamShort: 'CAP', strBadge: 'https://cdn/cap.png', strLocation: 'Curitiba' },
    { strTeam: 'São Paulo', strTeamShort: 'SAO', strBadge: 'https://cdn/sao.png', strLocation: 'São Paulo' },
  ],
}

ok('indexarLiga monta índice normalizado com série', () => {
  const idx = indexarLiga(FIXTURE, 'A')
  assert.equal(idx.size, 3)
  assert.ok(idx.has('fluminense'))
  assert.equal(idx.get('fluminense').serie, 'A')
  assert.equal(idx.get('fluminense').badge, 'https://cdn/flu.png')
})

ok('casarClube casa por chave direta', () => {
  const idx = indexarLiga(FIXTURE, 'A')
  const m = casarClube({ nome: 'Fluminense' }, idx)
  assert.ok(m)
  assert.equal(m.nome, 'Fluminense')
})

ok('casarClube casa via ALIAS (Athletico-PR → Athletico Paranaense)', () => {
  const idx = indexarLiga(FIXTURE, 'A')
  const m = casarClube({ nome: 'Athletico-PR' }, idx)
  assert.ok(m, 'deveria casar via alias')
  assert.equal(m.nome, 'Athletico Paranaense')
})

ok('casarClube casa São Paulo FC → São Paulo (sufixo FC)', () => {
  const idx = indexarLiga(FIXTURE, 'A')
  const m = casarClube({ nome: 'São Paulo FC' }, idx)
  assert.ok(m)
  assert.equal(m.nome, 'São Paulo')
})

ok('casarClube retorna null sem match (degradação graciosa)', () => {
  const idx = indexarLiga(FIXTURE, 'A')
  assert.equal(casarClube({ nome: 'Clube Inexistente XYZ' }, idx), null)
})

ok('saoMesmoClube une CAP × nome longo do catálogo', () => {
  assert.equal(
    saoMesmoClube(
      { nome: 'Athletico Paranaense', estado: 'PR' },
      { nome: 'Clube Atlético Paranaense', estado: 'PR' },
    ),
    true,
  )
})

ok('inferirUfDoNome não confunde Ceará SC com Santa Catarina', () => {
  assert.equal(inferirUfDoNome('Ceará SC'), null)
  assert.equal(inferirUfDoNome('Atlético-MG'), 'MG')
})

ok('scoreWikiAfiliacao casa Botafogo FR × Botafogo RJ', () => {
  assert.equal(
    scoreWikiAfiliacao({ nome: 'Botafogo FR' }, { nome: 'Botafogo', estado: 'RJ' }),
    100,
  )
  assert.equal(
    scoreWikiAfiliacao({ nome: 'Botafogo FR' }, { nome: 'Botafogo', estado: 'PB' }),
    0,
  )
})

ok('scoreWikiAfiliacao casa Sport Recife × Sport PE', () => {
  assert.equal(
    scoreWikiAfiliacao({ nome: 'Sport Recife' }, { nome: 'Sport', estado: 'PE' }),
    100,
  )
  assert.equal(
    scoreWikiAfiliacao(
      { nome: 'Sport Recife' },
      { nome: 'Sport Club São Paulo', estado: 'RS' },
    ),
    0,
  )
})

ok('scoreWikiAfiliacao casa Ceará SC × Ceará CE', () => {
  assert.equal(
    scoreWikiAfiliacao({ nome: 'Ceará SC' }, { nome: 'Ceará', estado: 'CE' }),
    100,
  )
})

ok('scoreWikiAfiliacao casa Grêmio × Grêmio Foot-Ball RS', () => {
  assert.equal(
    scoreWikiAfiliacao(
      { nome: 'Grêmio' },
      { nome: 'Grêmio Foot-Ball Porto Alegrense', estado: 'RS' },
    ),
    100,
  )
})

// --- dataset: slugs únicos em toda a base curada ---
ok('dataset gera slugs únicos para os 5 regiões inteiras', () => {
  const usados = new Set()
  for (const c of AFILIACOES_BRASIL) {
    assert.ok(c.nome && c.estado, `clube sem nome/estado: ${JSON.stringify(c)}`)
    gerarSlugUnico(c.nome, c.estado, usados)
  }
  assert.equal(usados.size, AFILIACOES_BRASIL.length, 'colisão não resolvida')
})

console.log(`\n${passed} asserções OK — ${AFILIACOES_BRASIL.length} clubes no dataset.`)
