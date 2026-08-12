/**
 * Invariantes do casamento Afiliacao ↔ API-Football.
 *
 *   pnpm --filter @torcida/db test:api-football-match
 *
 * O risco real aqui não é falhar em casar — é casar ERRADO em silêncio.
 * Estes casos vieram da resposta real de `GET /teams?search=corinthians`.
 */
import assert from 'node:assert/strict'
import {
  ehTimeIgnorado,
  indexarTimesApiFootball,
  casarAfiliacaoApiFootball,
  compartilhaTokenSignificativo,
  detectarColisoesIdExterno,
} from '../src/data/api-football-match.js'

const CATALOGO = [
  { team: { id: 131, name: 'Corinthians', country: 'Brazil' }, venue: { city: 'São Paulo' } },
  { team: { id: 1798, name: 'Corinthians W', country: 'Brazil' }, venue: { city: 'São Paulo' } },
  { team: { id: 12998, name: 'Corinthians U20', country: 'Brazil' }, venue: { city: 'São Paulo' } },
  { team: { id: 16045, name: 'Corinthians U23', country: 'Brazil' }, venue: { city: 'São Paulo' } },
  { team: { id: 6, name: 'Brazil', country: 'Brazil', national: true }, venue: { city: 'Rio de Janeiro' } },
  // Homônimos reais do catálogo BR (5 Flamengos). O `SE` tem cidade nula na
  // API — é ele que quebrava o desempate antes da regra de localização estrita.
  { team: { id: 127, name: 'Flamengo', country: 'Brazil' }, venue: { city: 'Rio de Janeiro, Rio de Janeiro' } },
  { team: { id: 13093, name: 'Flamengo PI', country: 'Brazil' }, venue: { city: 'Teresina, Piauí' } },
  { team: { id: 24810, name: 'Flamengo SE', country: 'Brazil' }, venue: { city: null } },
  // Ypiranga existe em mais de um estado.
  { team: { id: 9001, name: 'Ypiranga', country: 'Brazil' }, venue: { city: 'Erechim, Rio Grande do Sul' } },
  { team: { id: 9002, name: 'Ypiranga', country: 'Brazil' }, venue: { city: 'Salvador, Bahia' } },
]

const indice = indexarTimesApiFootball(CATALOGO)
let ok = 0

function checa(nome, fn) {
  fn()
  ok += 1
  console.log(`  ✓ ${nome}`)
}

checa('descarta feminino, base, reservas e seleção', () => {
  assert.equal(ehTimeIgnorado({ name: 'Corinthians W' }), true)
  assert.equal(ehTimeIgnorado({ name: 'Corinthians U20' }), true)
  assert.equal(ehTimeIgnorado({ name: 'Santos Sub-17' }), true)
  assert.equal(ehTimeIgnorado({ name: 'Palmeiras II' }), true)
  assert.equal(ehTimeIgnorado({ name: 'Brazil', national: true }), true)
  assert.equal(ehTimeIgnorado({ name: 'Corinthians' }), false)
})

checa('clube profissional casa com confiança alta', () => {
  const r = casarAfiliacaoApiFootball({ nome: 'Corinthians', cidade: 'São Paulo' }, indice)
  assert.equal(r.status, 'alta')
  assert.equal(r.escolhido.id, 131)
})

checa('feminino e base nunca são escolhidos', () => {
  const r = casarAfiliacaoApiFootball({ nome: 'Corinthians', cidade: 'São Paulo' }, indice)
  assert.equal(r.candidatos.length, 1, 'só o profissional deve estar no índice')
})

checa('homônimos sem localização nossa vão para revisão', () => {
  const r = casarAfiliacaoApiFootball({ nome: 'Ypiranga', cidade: null, estado: null }, indice)
  assert.equal(r.status, 'revisar')
  assert.equal(r.escolhido, null)
  assert.equal(r.candidatos.length, 2)
})

checa('homônimos com cidade nossa desempatam', () => {
  const r = casarAfiliacaoApiFootball({ nome: 'Ypiranga', cidade: 'Erechim' }, indice)
  assert.equal(r.status, 'alta')
  assert.equal(r.escolhido.id, 9001)
})

checa('UF desempata homônimo (regressão: candidato de cidade nula)', () => {
  const rj = casarAfiliacaoApiFootball({ nome: 'Flamengo', cidade: 'Rio de Janeiro', estado: 'RJ' }, indice)
  assert.equal(rj.status, 'alta', 'Flamengo/RJ não pode cair em revisão por causa do Flamengo SE sem cidade')
  assert.equal(rj.escolhido.id, 127)

  const pi = casarAfiliacaoApiFootball({ nome: 'Flamengo', cidade: 'Teresina', estado: 'PI' }, indice)
  assert.equal(pi.status, 'alta')
  assert.equal(pi.escolhido.id, 13093, 'homônimo de outra UF é um clube diferente')
})

checa('candidato sem cidade nunca vence desempate', () => {
  const r = casarAfiliacaoApiFootball({ nome: 'Flamengo', cidade: null, estado: 'SE' }, indice)
  assert.equal(r.status, 'revisar')
  assert.equal(r.escolhido, null)
})

checa('clube ausente do catálogo não inventa match', () => {
  const r = casarAfiliacaoApiFootball({ nome: 'Clube Inexistente FC', cidade: 'X' }, indice)
  assert.equal(r.status, 'sem-match')
  assert.equal(r.escolhido, null)
})

checa('nome sem palavra em comum não passa como confiança alta', () => {
  assert.equal(compartilhaTokenSignificativo('Sport Club do Recife', 'Sport Recife'), true)
  assert.equal(compartilhaTokenSignificativo('Associação Ferroviária', 'Ferroviaria'), true)
  // Colapso de ruído do `chaveMatch` não pode virar casamento silencioso.
  assert.equal(compartilhaTokenSignificativo('Associação Atlética Batel', 'Grêmio Novorizontino'), false)
})

checa('id externo disputado por duas afiliações é bloqueado', () => {
  // Caso real: "Gama (DF)" e "Sociedade Esportiva Gama (DF)" → mesmo id 1222.
  const disputados = detectarColisoesIdExterno([{ id: 1222 }, { id: 1222 }, { id: 131 }])
  assert.equal(disputados.has(1222), true, 'duplicata do catálogo não pode gravar dos dois lados')
  assert.equal(disputados.has(131), false)
  assert.equal(disputados.size, 1)
})

checa('sem duplicata, nada é bloqueado', () => {
  assert.equal(detectarColisoesIdExterno([{ id: 1 }, { id: 2 }, { id: 3 }]).size, 0)
  assert.equal(detectarColisoesIdExterno([]).size, 0)
})

console.log(`\n${ok} invariantes ok.`)
