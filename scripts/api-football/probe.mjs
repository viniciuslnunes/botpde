#!/usr/bin/env node
/**
 * Sonda a API-Football v3 com a chave do dashboard (plano free) e reporta o que
 * a chave REALMENTE libera — plano, quota, temporadas, cobertura BR.
 *
 * Uso:
 *   API_FOOTBALL_KEY=xxxx node scripts/api-football/probe.mjs
 *   node scripts/api-football/probe.mjs --time=corinthians
 *
 * Gasta 5 requisições da quota diária (free = 100/dia) — /status não conta.
 * Nada é gravado no banco.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const BASE = 'https://v3.football.api-sports.io'

function lerChave() {
  if (process.env.API_FOOTBALL_KEY) return process.env.API_FOOTBALL_KEY
  for (const arquivo of ['.env', '.env.local']) {
    try {
      const texto = readFileSync(resolve(process.cwd(), arquivo), 'utf8')
      const linha = texto.split('\n').find((l) => l.startsWith('API_FOOTBALL_KEY='))
      if (linha) return linha.slice('API_FOOTBALL_KEY='.length).trim().replace(/^["']|["']$/g, '')
    } catch {
      /* arquivo ausente */
    }
  }
  return null
}

const CHAVE = lerChave()
if (!CHAVE) {
  console.error('Faltou API_FOOTBALL_KEY (env ou .env na raiz).')
  process.exit(1)
}

const argTime = (process.argv.find((a) => a.startsWith('--time=')) || '').split('=')[1] || 'corinthians'

let gastas = 0

async function chamar(caminho) {
  const url = `${BASE}${caminho}`
  const res = await fetch(url, { headers: { 'x-apisports-key': CHAVE } })
  gastas += 1
  const quota = {
    limiteDia: res.headers.get('x-ratelimit-requests-limit'),
    restamDia: res.headers.get('x-ratelimit-requests-remaining'),
    limiteMin: res.headers.get('X-RateLimit-Limit'),
    restamMin: res.headers.get('X-RateLimit-Remaining'),
  }
  const body = await res.json().catch(() => ({}))
  return { status: res.status, quota, body }
}

function erros(body) {
  const e = body?.errors
  if (!e || (Array.isArray(e) && e.length === 0)) return null
  return typeof e === 'object' ? JSON.stringify(e) : String(e)
}

function titulo(t) {
  console.log(`\n=== ${t} ===`)
}

const ANO = new Date().getFullYear()

async function main() {
  titulo('1. /status — plano e quota')
  const status = await chamar('/status')
  if (status.status !== 200 || erros(status.body)) {
    console.error('Falhou:', status.status, erros(status.body) || status.body)
    process.exit(1)
  }
  const s = status.body.response
  console.log('conta      :', s?.account?.email ?? '—')
  console.log('plano      :', s?.subscription?.plan, '| ativo até', s?.subscription?.end)
  console.log('quota dia  :', `${s?.requests?.current}/${s?.requests?.limit_day}`)
  console.log('headers    :', status.quota)

  titulo('2. /leagues?country=Brazil — o que a chave enxerga')
  const ligas = await chamar('/leagues?country=Brazil')
  const err2 = erros(ligas.body)
  if (err2) console.log('erro:', err2)
  const listaLigas = ligas.body?.response ?? []
  console.log(`ligas retornadas: ${listaLigas.length}`)
  for (const item of listaLigas.slice(0, 25)) {
    const temporadas = (item.seasons ?? []).map((t) => t.year)
    const atual = (item.seasons ?? []).find((t) => t.current)
    const cob = atual?.coverage ?? {}
    console.log(
      `  id=${String(item.league.id).padStart(4)} ${item.league.name} (${item.league.type})` +
        ` | temporadas ${Math.min(...temporadas)}–${Math.max(...temporadas)}` +
        ` | current=${atual?.year ?? '—'}` +
        ` | standings=${cob.standings ?? '—'} events=${cob.fixtures?.events ?? '—'}`,
    )
  }

  titulo(`3. /fixtures — temporada corrente (${ANO}) no Brasileirão Série A (league=71)`)
  const corrente = await chamar(`/fixtures?league=71&season=${ANO}&next=5`)
  const err3 = erros(corrente.body)
  console.log('resultados:', corrente.body?.results ?? 0, err3 ? `| erro: ${err3}` : '')
  for (const f of corrente.body?.response ?? []) {
    console.log(
      `  ${f.fixture.date}  ${f.teams.home.name} x ${f.teams.away.name}` +
        `  [${f.fixture.status.short}] fixtureId=${f.fixture.id} venue=${f.fixture.venue?.name ?? '—'}`,
    )
  }

  titulo('4. /fixtures — temporada antiga (2023) no mesmo campeonato')
  const antiga = await chamar('/fixtures?league=71&season=2023&last=3')
  const err4 = erros(antiga.body)
  console.log('resultados:', antiga.body?.results ?? 0, err4 ? `| erro: ${err4}` : '')

  titulo(`5. /teams?search=${argTime} — id externo p/ Afiliacao.apiExternalId`)
  const times = await chamar(`/teams?search=${encodeURIComponent(argTime)}`)
  const err5 = erros(times.body)
  if (err5) console.log('erro:', err5)
  for (const t of (times.body?.response ?? []).slice(0, 10)) {
    console.log(
      `  id=${String(t.team.id).padStart(5)} ${t.team.name} (${t.team.country})` +
        ` escudo=${t.team.logo}`,
    )
  }

  titulo('6. /standings — classificação Série A na temporada corrente')
  const tabela = await chamar(`/standings?league=71&season=${ANO}`)
  const err6 = erros(tabela.body)
  console.log('resultados:', tabela.body?.results ?? 0, err6 ? `| erro: ${err6}` : '')
  const grupo = tabela.body?.response?.[0]?.league?.standings?.[0] ?? []
  for (const linha of grupo.slice(0, 5)) {
    console.log(`  ${String(linha.rank).padStart(2)}. ${linha.team.name} — ${linha.points} pts`)
  }

  titulo('Resumo')
  console.log(`requisições contadas nesta sonda: ${gastas - 1} (/status é grátis)`)
  console.log('Se (3) e (6) vierem vazios/erro e (4) vier com dados, a chave free')
  console.log('não cobre a temporada corrente — o que inviabiliza sync de Partida no free.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
