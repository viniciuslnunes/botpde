import { describe, expect, it, vi } from 'vitest'
import { db } from '@torcida/db'
import { carregarEnvApiFootball } from '@/test/env-api-football'

carregarEnvApiFootball()

/**
 * Sincroniza `Partida` de verdade no banco apontado pelo ambiente — e **mantém**
 * os dados, para dar de olhar na tela.
 *
 *   TORCIDA_ENV=local pnpm --filter @torcida/web seed:partidas-sync
 *
 * A chave vem de `apps/web/.env.local` — sem prefixo na linha de comando.
 *
 * Diferença para `audit:partidas-sync`: a auditoria prova a regra e **reverte**;
 * este seed popula e deixa lá. É o que você roda antes de abrir o navegador.
 *
 * Temporada 2024 e janela larga, porque é o que o plano free libera — os jogos
 * aparecem no admin como partidas passadas. Com o plano pago, troque
 * `TEMPORADA`/janela para o ano corrente (ou use o cron `/api/cron/partidas-sync`).
 *
 * Ver `docs/data/integracao-api-football.md` § Como testar localmente.
 */

const CHAVE = process.env.API_FOOTBALL_KEY
const TEMPORADA = Number(process.env.API_FOOTBALL_SEASON ?? 2024)

vi.mock('@/lib/env', () => ({
  env: { API_FOOTBALL_KEY: process.env.API_FOOTBALL_KEY, API_FOOTBALL_SEASON: TEMPORADA },
  isProvedorPartidasConfigured: () => Boolean(process.env.API_FOOTBALL_KEY),
}))

describe.skipIf(!CHAVE)('seed: sync de partidas', () => {
  it('popula Partida e reporta onde ver na tela', async () => {
    const comId: number = await db.afiliacao.count({
      where: { ativo: true, apiExternalId: { not: null } },
    })
    expect(
      comId,
      'rode antes: pnpm --filter @torcida/db seed:api-football-ids -- --apply',
    ).toBeGreaterThan(0)

    const { sincronizarPartidas } = await import('@/lib/partidas-sync/sync')
    const r = await sincronizarPartidas({
      temporada: TEMPORADA,
      competicoes: [71, 72], // Série A + B — 2 requisições
      janela: { de: new Date(`${TEMPORADA}-05-01`), ate: new Date(`${TEMPORADA}-06-30`) },
    })

    console.log(
      `\n  temporada ${r.temporada} · fixtures ${r.fixtures} · criadas ${r.criadas} · ` +
        `adotadas ${r.adotadas} · atualizadas ${r.atualizadas}\n`,
    )
    expect(r.configurado).toBe(true)

    // Onde olhar: tenant com afiliação que tem partida sincronizada.
    type TenantAlvo = { slug: string; nome: string; afiliacao: { nome: string } | null }
    const comPartidas: { afiliacaoId: string }[] = await db.partida.findMany({
      where: { fonteExternalId: { not: null } },
      select: { afiliacaoId: true },
      distinct: ['afiliacaoId'],
      take: 50,
    })

    const tenants: TenantAlvo[] = await db.tenant.findMany({
      where: { afiliacaoId: { in: comPartidas.map((p) => p.afiliacaoId) } },
      select: { slug: true, nome: true, afiliacao: { select: { nome: true } } },
      take: 10,
    })

    const total: number = await db.partida.count({ where: { fonteExternalId: { not: null } } })
    console.log(`  Partidas sincronizadas no banco: ${total}`)
    console.log('  Torcidas onde elas aparecem (admin → Agenda → nova atividade):')
    for (const t of tenants) {
      console.log(`    · ${t.nome} [${t.slug}] — clube: ${t.afiliacao?.nome ?? '—'}`)
    }
    if (tenants.length === 0) {
      console.log(
        '    (nenhuma — o banco local não tem torcida ligada a clube com jogo na janela)',
      )
    }

    await db.$disconnect()
  })
})
