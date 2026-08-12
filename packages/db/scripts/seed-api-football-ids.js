/**
 * Preenche `Afiliacao.apiExternalId` a partir do snapshot da API-Football.
 *
 *   pnpm --filter @torcida/db seed:api-football-ids                 # simula (padrão)
 *   pnpm --filter @torcida/db seed:api-football-ids -- --apply      # grava
 *   pnpm --filter @torcida/db seed:api-football-ids -- --apply --escudos
 *
 * Offline: lê `src/data/api-football-times-br.json` (gerado por
 * `coleta:api-football-times`). Não gasta cota da API.
 *
 * **Só grava o que casou com confiança alta.** Ambiguidade vai para o relatório
 * `api-football-report.json`, para decisão humana — id errado aqui vira jogo de
 * outro clube na Agenda semanas depois. Ver `docs/data/integracao-api-football.md`.
 *
 * `--escudos` preenche `escudoUrl` **apenas onde está vazio**, com a URL do CDN
 * deles (fora da cota). Rodar `seed:migrate-escudos-cloudinary` depois para
 * rebater no nosso CDN — a doc da API-Football recomenda não servir direto.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'
import {
  indexarTimesApiFootball,
  casarAfiliacaoApiFootball,
  detectarColisoesIdExterno,
} from '../src/data/api-football-match.js'
import { prepareSeedEnv } from './lib/seed-env.js'

prepareSeedEnv({ scriptLabel: 'seed:api-football-ids' })

const AQUI = dirname(fileURLToPath(import.meta.url))
const SNAPSHOT = resolve(AQUI, '../src/data/api-football-times-br.json')
const RELATORIO = resolve(AQUI, '../src/data/api-football-report.json')

const APLICAR = process.argv.includes('--apply')
const COM_ESCUDOS = process.argv.includes('--escudos')

const db = new PrismaClient()

/** @typedef {{ id: string, nome: string, apelido: string | null, cidade: string | null, estado: string | null, apiExternalId: string | null, escudoUrl: string | null }} AfiliacaoLite */

async function main() {
  if (!existsSync(SNAPSHOT)) {
    console.error(
      'Snapshot ausente. Rode antes:\n' +
        '  API_FOOTBALL_KEY=xxx pnpm --filter @torcida/db coleta:api-football-times',
    )
    process.exit(1)
  }

  const snapshot = JSON.parse(readFileSync(SNAPSHOT, 'utf8'))
  const indice = indexarTimesApiFootball(snapshot.times.map((t) => ({ team: t, venue: { city: t.city } })))
  console.log(
    `snapshot de ${snapshot.coletadoEm?.slice(0, 10)}: ${snapshot.total} times → ${indice.size} chaves úteis`,
  )

  /** @type {AfiliacaoLite[]} */
  const afiliacoes = await db.afiliacao.findMany({
    where: { ativo: true },
    select: {
      id: true,
      nome: true,
      apelido: true,
      cidade: true,
      estado: true,
      apiExternalId: true,
      escudoUrl: true,
    },
    orderBy: { nome: 'asc' },
  })

  let gravados = 0
  let jaTinham = 0
  let escudos = 0
  const revisar = []
  const semMatch = []

  // Passo 1: casar tudo antes de gravar nada.
  /** @type {Array<{ af: AfiliacaoLite, r: ReturnType<typeof casarAfiliacaoApiFootball> }>} */
  const aprovados = []

  for (const af of afiliacoes) {
    if (af.apiExternalId) {
      jaTinham += 1
      continue
    }

    const r = casarAfiliacaoApiFootball(af, indice)

    if (r.status === 'sem-match') {
      semMatch.push(`${af.nome}${af.estado ? ` (${af.estado})` : ''}`)
      continue
    }

    if (r.status === 'revisar') {
      revisar.push({
        afiliacaoId: af.id,
        nome: af.nome,
        cidade: af.cidade,
        estado: af.estado,
        motivo: r.motivo,
        candidatos: r.candidatos,
      })
      continue
    }

    aprovados.push({ af, r })
  }

  // Passo 2: um id externo pertence a UM clube. Duas afiliações apontando para
  // o mesmo time são duplicata no nosso catálogo (ex.: "Gama" e "Sociedade
  // Esportiva Gama"), e gravar assim faria o sync criar a mesma partida duas
  // vezes — o unique `(afiliacaoId, fonteExternalId)` não pega, porque o
  // afiliacaoId difere. Nenhum dos lados é gravado: quem resolve é o merge do
  // catálogo (`db:mapa-torcidas-duplicadas` / `merge-torcidas-duplicadas.js`).
  const emDisputa = detectarColisoesIdExterno(aprovados.map((a) => a.r.escolhido))

  let colisoes = 0
  for (const idExterno of emDisputa) {
    const itens = aprovados.filter((a) => a.r.escolhido.id === idExterno)
    colisoes += 1
    const nomes = itens.map((i) => `${i.af.nome}${i.af.estado ? ` (${i.af.estado})` : ''}`)
    for (const item of itens) {
      revisar.push({
        afiliacaoId: item.af.id,
        nome: item.af.nome,
        cidade: item.af.cidade,
        estado: item.af.estado,
        motivo: `id externo ${idExterno} disputado por ${itens.length} afiliações — provável duplicata do catálogo: ${nomes.join(' | ')}`,
        candidatos: [item.r.escolhido],
      })
    }
    console.warn(`  ! colisão no id ${idExterno}: ${nomes.join(' || ')} — nenhum gravado`)
  }

  for (const { af, r } of aprovados) {
    if (emDisputa.has(r.escolhido.id)) continue

    const escolhido = r.escolhido
    const novoEscudo = COM_ESCUDOS && !af.escudoUrl && escolhido.logo ? escolhido.logo : null

    if (APLICAR) {
      await db.afiliacao.update({
        where: { id: af.id },
        data: {
          apiExternalId: String(escolhido.id),
          ...(novoEscudo ? { escudoUrl: novoEscudo } : {}),
        },
      })
    }

    gravados += 1
    if (novoEscudo) escudos += 1
    console.log(`  ✓ ${af.nome} → ${escolhido.nome} (id ${escolhido.id}) · ${r.motivo}`)
  }

  writeFileSync(
    RELATORIO,
    `${JSON.stringify({ geradoEm: new Date().toISOString(), revisar, semMatch }, null, 2)}\n`,
    'utf8',
  )

  console.log('\n--- resumo ---')
  console.log(`afiliações ativas      : ${afiliacoes.length}`)
  console.log(`já tinham id           : ${jaTinham}`)
  console.log(`casadas (confiança alta): ${gravados}${APLICAR ? ' — gravadas' : ' — SIMULAÇÃO'}`)
  if (COM_ESCUDOS) console.log(`escudos preenchidos    : ${escudos}`)
  console.log(`colisões de id externo : ${colisoes} (duplicata no catálogo — nenhum lado gravado)`)
  console.log(`para revisão humana    : ${revisar.length}`)
  console.log(`sem match              : ${semMatch.length}`)
  console.log(`relatório: src/data/api-football-report.json`)
  if (!APLICAR) console.log('\nNada foi gravado. Repita com -- --apply.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
