/**
 * Snapshot do catálogo de times brasileiros da API-Football (decisão #7).
 *
 *   pnpm --filter @torcida/db coleta:api-football-times
 *
 * Lê `API_FOOTBALL_KEY` de `apps/web/.env.local` (ou do ambiente).
 *
 * Custa **1 requisição** da cota: `GET /teams?country=Brazil` devolve os ~1577
 * times numa página só (`paging.total: 1`). O resultado vira arquivo versionado
 * e o seed roda offline em cima dele — reprocessar o casamento não gasta cota.
 *
 * Não toca no banco. Ver `docs/data/integracao-api-football.md`.
 */
import { writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnvFiles } from './lib/cloudinary-admin.js'

// A chave mora em `apps/web/.env.local` (fonte única) — sem precisar de prefixo
// na linha de comando. `process.env` continua tendo prioridade.
loadEnvFiles()

const AQUI = dirname(fileURLToPath(import.meta.url))
const DESTINO = resolve(AQUI, '../src/data/api-football-times-br.json')
const URL_TIMES = 'https://v3.football.api-sports.io/teams?country=Brazil'

const CHAVE = process.env.API_FOOTBALL_KEY
if (!CHAVE) {
  console.error('Faltou API_FOOTBALL_KEY no ambiente.')
  process.exit(1)
}

async function main() {
  // A API só aceita GET e SÓ o header x-apisports-key — header extra dá erro.
  const res = await fetch(URL_TIMES, { headers: { 'x-apisports-key': CHAVE } })
  const restam = res.headers.get('x-ratelimit-requests-remaining')
  const body = await res.json()

  const erros = body?.errors
  const temErro = Array.isArray(erros) ? erros.length > 0 : Boolean(erros && Object.keys(erros).length)
  if (!res.ok || temErro) {
    console.error(`Falhou (HTTP ${res.status}):`, JSON.stringify(erros))
    process.exit(1)
  }

  const times = (body.response ?? []).map((item) => ({
    id: item.team.id,
    name: item.team.name,
    code: item.team.code ?? null,
    national: Boolean(item.team.national),
    logo: item.team.logo ?? null,
    city: item.venue?.city ?? null,
  }))

  const snapshot = {
    fonte: 'api-football.com · GET /teams?country=Brazil',
    coletadoEm: new Date().toISOString(),
    total: times.length,
    times,
  }

  writeFileSync(DESTINO, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')
  console.log(`${times.length} times gravados em src/data/api-football-times-br.json`)
  console.log(`requisições restantes hoje: ${restam ?? '?'}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
