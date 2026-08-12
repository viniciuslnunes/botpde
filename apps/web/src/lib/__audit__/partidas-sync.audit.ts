import { afterAll, describe, expect, it, vi } from 'vitest'
import { db } from '@torcida/db'
import { carregarEnvApiFootball } from '@/test/env-api-football'

carregarEnvApiFootball()

/**
 * Auditoria ponta a ponta do sync de `Partida` (decisão #7) contra o banco real.
 *
 *   TORCIDA_ENV=local pnpm --filter @torcida/web audit:partidas-sync
 *
 * A chave vem de `apps/web/.env.local` — sem prefixo na linha de comando.
 *
 * Roda contra a **temporada 2024** (o plano free só libera 2022–2024) e uma
 * janela curta, gastando ~6 requisições da cota. Ao final **reverte** tudo que
 * criou — segue o padrão de `audit:fluxos` (muta e reverte).
 *
 * Pula sozinha sem `API_FOOTBALL_KEY`, para não quebrar quem rodar `audit:tudo`
 * sem o provedor configurado.
 */
const CHAVE = process.env.API_FOOTBALL_KEY

// `setup-env.ts` liga SKIP_ENV_VALIDATION, e nesse modo o `env.ts` devolve um
// objeto fixo com as variáveis opcionais zeradas — a chave real do shell não
// chega ao módulo. Aqui só o **config** é simulado: banco e API são reais.
vi.mock('@/lib/env', () => ({
  env: { API_FOOTBALL_KEY: process.env.API_FOOTBALL_KEY, API_FOOTBALL_SEASON: 2024 },
  isProvedorPartidasConfigured: () => Boolean(process.env.API_FOOTBALL_KEY),
}))

/** Ids criados por esta auditoria — removidos no final. */
const criadas: string[] = []

describe.skipIf(!CHAVE)('sync de partidas (banco real)', () => {
  afterAll(async () => {
    if (criadas.length > 0) {
      await db.partida.deleteMany({ where: { id: { in: criadas } } })
    }
    await db.$disconnect()
  })

  it('grava partidas reais de 2024 para clubes com apiExternalId', async () => {
    const comId = await db.afiliacao.count({
      where: { ativo: true, apiExternalId: { not: null } },
    })
    expect(
      comId,
      'rode antes: pnpm --filter @torcida/db seed:api-football-ids -- --apply',
    ).toBeGreaterThan(0)

    const idsAntes: { id: string }[] = await db.partida.findMany({ select: { id: true } })
    const antes = new Set(idsAntes.map((p) => p.id))

    const { sincronizarPartidas } = await import('@/lib/partidas-sync/sync')
    const r = await sincronizarPartidas({
      temporada: 2024,
      competicoes: [71], // só Série A — 1 requisição por execução
      janela: { de: new Date('2024-05-01'), ate: new Date('2024-05-08') },
    })

    type PartidaAudit = {
      id: string
      adversario: string
      dataHora: Date
      fonteExternalId: string | null
      mando: 'CASA' | 'FORA'
    }
    const depois: PartidaAudit[] = await db.partida.findMany({
      select: { id: true, adversario: true, dataHora: true, fonteExternalId: true, mando: true },
    })
    for (const p of depois) if (!antes.has(p.id)) criadas.push(p.id)

    console.log(
      `  fixtures: ${r.fixtures} · criadas: ${r.criadas} · adotadas: ${r.adotadas} · ` +
        `atualizadas: ${r.atualizadas} · clubes mapeados: ${r.clubes}`,
    )

    expect(r.configurado).toBe(true)
    expect(r.fixtures).toBeGreaterThan(0)

    // Não exigir `criadas > 0`: o banco pode já ter sido populado por
    // `seed:partidas-sync`. O que importa é que a janela ficou persistida —
    // por criação, adoção ou atualização.
    expect(r.criadas + r.adotadas + r.atualizadas).toBeGreaterThan(0)

    const sincronizadas = depois.filter((p) => p.fonteExternalId !== null)
    expect(sincronizadas.length).toBeGreaterThan(0)

    const amostra = sincronizadas[0]
    expect(amostra.fonteExternalId).toMatch(/^\d+$/)
    expect(amostra.adversario.length).toBeGreaterThan(0)
    expect(['CASA', 'FORA']).toContain(amostra.mando)
  })

  it('é idempotente: rodar de novo não duplica', async () => {
    const { sincronizarPartidas } = await import('@/lib/partidas-sync/sync')
    const antes = await db.partida.count()

    const r = await sincronizarPartidas({
      temporada: 2024,
      competicoes: [71], // só Série A — 1 requisição por execução
      janela: { de: new Date('2024-05-01'), ate: new Date('2024-05-08') },
    })

    const depois = await db.partida.count()
    expect(depois, 'segunda execução não pode criar linha nova').toBe(antes)
    expect(r.criadas, 'nada novo: o fixture já está no banco').toBe(0)
    expect(r.atualizadas).toBeGreaterThan(0)
  })
})
