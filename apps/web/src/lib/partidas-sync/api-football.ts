import 'server-only'
import { env } from '@/lib/env'
import type { JanelaSync, PartidaExterna, Provedor } from './contrato'
import { mapearStatus } from './contrato'

/**
 * Adapter API-Football do contrato de provedor (decisão #7).
 *
 * Restrições que a doc deles impõe e que este arquivo respeita:
 * - só `GET`, e **só** o header `x-apisports-key` (header extra → erro);
 * - `errors` pode vir preenchido com HTTP 200 — checar sempre;
 * - pico anormal pode gerar bloqueio de firewall, então as competições são
 *   percorridas em série, nunca com `Promise.all`.
 *
 * Ver `docs/data/integracao-api-football.md`.
 */

const BASE = 'https://v3.football.api-sports.io'

/**
 * Competições brasileiras sincronizadas. Lista fixa e versionada de propósito:
 * muda uma vez por ano, e descobrir por query gastaria cota todo dia.
 * Ids medidos via `GET /leagues?country=Brazil`.
 */
export const COMPETICOES_BR = [
  71, // Série A
  72, // Série B
  75, // Série C
  76, // Série D
  73, // Copa do Brasil
  475, // Paulista A1
] as const

/**
 * Intervalo mínimo entre chamadas. O free permite 10/min, e a doc deles avisa
 * que pico anormal pode gerar bloqueio de firewall **permanente, sem aviso** —
 * então o sync anda devagar de propósito. Um cron diário não tem pressa: 6
 * competições levam ~40s.
 */
const PAUSA_ENTRE_CHAMADAS_MS = 6_500

/** Tentativas em caso de 429 (limite por minuto). */
const TENTATIVAS_429 = 3

function dormir(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function formatarData(d: Date): string {
  return d.toISOString().slice(0, 10)
}

type FixtureApi = {
  fixture: {
    id: number
    date: string
    status: { short: string | null } | null
    venue: { name: string | null; city: string | null } | null
  }
  league: { name: string | null; round: string | null } | null
  teams: { home: { id: number; name: string }; away: { id: number; name: string } }
  goals: { home: number | null; away: number | null }
}

async function buscar(caminho: string): Promise<FixtureApi[]> {
  const chave = env.API_FOOTBALL_KEY
  if (!chave) throw new Error('API_FOOTBALL_KEY ausente — provedor de partidas não configurado.')

  for (let tentativa = 1; ; tentativa += 1) {
    const res = await fetch(`${BASE}${caminho}`, {
      headers: { 'x-apisports-key': chave },
      cache: 'no-store',
    })

    // 429 = limite por minuto. Recuar e tentar de novo é o comportamento certo;
    // insistir é o que dispara o bloqueio de firewall.
    if (res.status === 429 && tentativa < TENTATIVAS_429) {
      await dormir(PAUSA_ENTRE_CHAMADAS_MS * tentativa)
      continue
    }

    const body: { errors?: unknown; response?: FixtureApi[] } = await res.json()

    // HTTP 200 com `errors` preenchido é o caso comum de restrição de plano
    // ("Free plans do not have access to this season") — precisa falhar alto.
    const errors = body?.errors
    const temErro = Array.isArray(errors)
      ? errors.length > 0
      : Boolean(errors && Object.keys(errors as object).length > 0)

    if (!res.ok || temErro) {
      throw new Error(`API-Football HTTP ${res.status}: ${JSON.stringify(errors ?? {})}`)
    }

    return body.response ?? []
  }
}

function normalizar(f: FixtureApi): PartidaExterna | null {
  if (!f?.fixture?.id || !f.teams?.home?.id || !f.teams?.away?.id) return null

  const data = new Date(f.fixture.date)
  if (Number.isNaN(data.getTime())) return null

  const rodada = f.league?.round?.trim()
  const competicao = f.league?.name
    ? rodada
      ? `${f.league.name} — ${rodada}`
      : f.league.name
    : null

  return {
    fonteExternalId: String(f.fixture.id),
    timeCasaExternalId: String(f.teams.home.id),
    timeForaExternalId: String(f.teams.away.id),
    adversarioCasa: f.teams.home.name,
    adversarioFora: f.teams.away.name,
    dataHora: data,
    competicao,
    local: f.fixture.venue?.name ?? null,
    status: mapearStatus(f.fixture.status?.short),
    placarCasa: f.goals?.home ?? null,
    placarFora: f.goals?.away ?? null,
  }
}

export const provedorApiFootball: Provedor = {
  nome: 'api-football',

  async listarPartidas({
    competicoes,
    janela,
    temporada,
  }: {
    competicoes: number[]
    janela: JanelaSync
    temporada: number
  }): Promise<PartidaExterna[]> {
    const de = formatarData(janela.de)
    const ate = formatarData(janela.ate)
    const saida: PartidaExterna[] = []

    // Série, não paralelo: 1 requisição por competição cobre TODOS os clubes
    // dela na janela. Iterar clube a clube multiplicaria a cota por 20.
    for (const [i, liga] of competicoes.entries()) {
      if (i > 0) await dormir(PAUSA_ENTRE_CHAMADAS_MS)
      const fixtures = await buscar(
        `/fixtures?league=${liga}&season=${temporada}&from=${de}&to=${ate}&timezone=America/Sao_Paulo`,
      )
      for (const f of fixtures) {
        const p = normalizar(f)
        if (p) saida.push(p)
      }
    }

    return saida
  },
}
