/**
 * Teste puro (offline, sem rede/DB) das regras do catálogo de clubes e da
 * rivalidade curada.
 *   node scripts/test-catalogo-clubes.js
 * Segue o padrão "script de asserção" — packages/db não usa Vitest.
 *
 * Estes invariantes existem porque cada um deles JÁ QUEBROU uma vez
 * (docs/data/auditoria-catalogo-clubes.md): alias em ciclo escondendo o
 * Bragantino, clássico interestadual isolando torcida, e cidade de clube
 * herdada do endereço da torcida.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chaveCanonicaClube, ALIASES } from '../src/data/afiliacoes-normalize.js'
import { RIVALIDADES_CLUBES } from '../src/data/rivalidades-clubes.js'
import { TORCEDORES_PESQUISA, BASE_POPULACIONAL_16_MAIS } from '../src/data/torcedores-pesquisa-datafolha.js'
import { consolidarCores, publicIdDaUrl } from './lib/cores-escudo.js'
import {
  anoFundacaoTorcida,
  chaveTorcida,
  distanciaEdicao,
  melhorCandidato,
  validadorCidade,
} from './lib/catalogo-clubes.js'

const RAIZ = resolve(fileURLToPath(import.meta.url), '../../src/data')
const lerJson = (arquivo) => JSON.parse(readFileSync(resolve(RAIZ, arquivo), 'utf8'))

let passed = 0
function ok(nome, fn) {
  fn()
  passed += 1
  console.log(`  ✓ ${nome}`)
}

// --- chave canônica de clube ------------------------------------------------
ok('chaveCanonicaClube resolve alias em ciclo de forma estável', () => {
  const bragantino = chaveCanonicaClube('Bragantino', 'SP')
  assert.equal(chaveCanonicaClube('Red Bull Bragantino', 'SP'), bragantino)
  assert.equal(chaveCanonicaClube('Clube Atlético Bragantino', 'SP'), bragantino)
})

ok('chaveCanonicaClube separa homônimos por UF', () => {
  assert.notEqual(chaveCanonicaClube('Atlético', 'MG'), chaveCanonicaClube('Atlético', 'GO'))
  assert.equal(chaveCanonicaClube('Atlético', 'MG'), chaveCanonicaClube('Clube Atlético Mineiro', 'MG'))
})

ok('alias de mão dupla não trava a resolução', () => {
  // Não proibimos o ciclo (há dois sentidos legítimos no mesmo mapa), mas
  // qualquer entrada precisa terminar em chave estável e não vazia.
  for (const chave of Object.keys(ALIASES)) {
    const resolvida = chaveCanonicaClube(chave, '')
    assert.ok(resolvida.length > 0, `alias "${chave}" resolveu para vazio`)
  }
})

// --- rivalidades ------------------------------------------------------------
ok('nenhuma rivalidade curada é interestadual', () => {
  for (const par of RIVALIDADES_CLUBES) {
    assert.notEqual(par.escopo, 'INTERESTADUAL', `${par.a} x ${par.b}`)
  }
})

ok('isola só quando é da mesma cidade ou tem clássico nomeado', () => {
  for (const par of RIVALIDADES_CLUBES) {
    const esperado = par.escopo === 'MUNICIPAL' || (par.escopo === 'ESTADUAL' && !!par.classico)
    assert.equal(par.isola, esperado, `${par.a} x ${par.b} (${par.uf})`)
  }
})

ok('rivalidade não se repete nem aponta o clube para ele mesmo', () => {
  const vistos = new Set()
  for (const par of RIVALIDADES_CLUBES) {
    assert.notEqual(par.a, par.b, `par degenerado: ${par.a}`)
    const chave = [par.a, par.b].sort().join('::') + `|${par.uf}`
    assert.ok(!vistos.has(chave), `par duplicado: ${chave}`)
    vistos.add(chave)
  }
})

// --- torcedores por pesquisa ------------------------------------------------
ok('absoluto da pesquisa bate com percentual x base do IBGE', () => {
  for (const linha of TORCEDORES_PESQUISA) {
    const esperado = Math.round((BASE_POPULACIONAL_16_MAIS * linha.percentual) / 100)
    assert.equal(linha.torcedores, esperado, linha.nome)
    assert.equal(linha.dentroDaMargem, linha.percentual <= 2, linha.nome)
  }
})

// --- fundação de torcida ----------------------------------------------------
ok('anoFundacaoTorcida entende os formatos sujos da fonte', () => {
  assert.equal(anoFundacaoTorcida('23/10/1992'), 1992)
  assert.equal(anoFundacaoTorcida('**/**/2006'), 2006)
  assert.equal(anoFundacaoTorcida('1969'), 1969)
  assert.equal(anoFundacaoTorcida(''), null)
  assert.equal(anoFundacaoTorcida('12/12'), null)
  assert.equal(anoFundacaoTorcida('01/01/1850'), null) // antes das organizadas
})

ok('chaveTorcida normaliza prefixo, acento e número', () => {
  assert.equal(chaveTorcida('Torcida Pavilhão 9'), chaveTorcida('PAVILHÃO NOVE'))
  assert.equal(chaveTorcida('Torcida Organizada Mancha Alvi-Verde'), chaveTorcida('Mancha AlviVerde'))
})

ok('distanciaEdicao mede o typo da lista oficial', () => {
  assert.equal(distanciaEdicao('gladiadores', 'gladiaores'), 1)
  assert.equal(distanciaEdicao('', 'abc'), 3)
})

// --- cores do escudo --------------------------------------------------------
ok('consolidarCores funde anti-aliasing e corta ruído', () => {
  const paleta = consolidarCores([
    ['#000000', 30],
    ['#050505', 8], // mesmo preto, borda suavizada
    ['#FFFFFF', 25],
    ['#123456', 1], // ruído abaixo do piso
  ])
  assert.equal(paleta.length, 2)
  assert.equal(paleta[0].hex, '#000000')
  assert.equal(paleta[0].participacao, 38)
})

ok('publicIdDaUrl tira versão e extensão', () => {
  assert.equal(
    publicIdDaUrl('https://res.cloudinary.com/x/image/upload/v1783914682/torcida/catalogo/escudos/democrata-mg.png'),
    'torcida/catalogo/escudos/democrata-mg',
  )
  assert.equal(publicIdDaUrl('https://exemplo.com/escudo.png'), null)
})

// --- casamento e cidade -----------------------------------------------------
ok('melhorCandidato acha nome curto dentro do nome longo', () => {
  const candidatos = [{ nome: 'Marilia Atlético Clube' }, { nome: 'Botafogo Futebol Clube' }]
  const { clube, score } = melhorCandidato('Marília', candidatos)
  assert.equal(clube.nome, 'Marilia Atlético Clube')
  assert.ok(score >= 0.8, `score baixo: ${score}`)
})

ok('melhorCandidato não casa clubes diferentes só por token genérico', () => {
  const { score } = melhorCandidato('Retrô', [{ nome: 'Sport Club do Recife' }])
  assert.ok(score < 0.45, `score alto demais: ${score}`)
})

ok('validador de cidade aceita região administrativa do DF', () => {
  const { valida } = validadorCidade({ DF: ['Brasília'], SP: ['São Paulo'] })
  assert.equal(valida('Brasília', 'DF'), true)
  assert.equal(valida('Ceilândia', 'DF'), true, 'RA do DF é cidade legítima no cadastro')
  assert.equal(valida('São Paulo', 'DF'), false)
  assert.equal(valida('Centro', 'SP'), false, 'bairro não é município')
})

// --- datasets ---------------------------------------------------------------
ok('dataset da CBF tem os 235 clubes e todos com UF e pontos', () => {
  const rnc = lerJson('cbf-ranking-clubes-2026.json')
  assert.equal(rnc.total, rnc.clubes.length)
  assert.equal(rnc.clubes.length, 235)
  for (const clube of rnc.clubes) {
    assert.ok(clube.uf && clube.uf.length === 2, `UF inválida: ${clube.clube}`)
    assert.ok(Number.isInteger(clube.pontos), `pontos inválidos: ${clube.clube}`)
  }
})

ok('lista da FPF tem os 135 registros com clube e cidade', () => {
  const fpf = lerJson('fpf-torcidas-cadastradas-sp.json')
  assert.equal(fpf.torcidas.length, 135)
  for (const t of fpf.torcidas) {
    assert.ok(t.torcida && t.clube, `registro incompleto: ${JSON.stringify(t)}`)
  }
})

ok('correções curadas declaram fonte e confiança', () => {
  const curadas = lerJson('clubes-correcoes-curadas.json')
  for (const item of [...curadas.correcoes, ...curadas.merges]) {
    assert.ok(item.fonte, `sem fonte: ${JSON.stringify(item.alvo ?? item.origem)}`)
    assert.ok(['alta', 'media'].includes(item.confianca), 'confiança inválida')
  }
})

console.log(
  `\n${passed} asserções OK — ${RIVALIDADES_CLUBES.length} rivalidades curadas ` +
    `(${RIVALIDADES_CLUBES.filter((p) => p.isola).length} isolam).`,
)
