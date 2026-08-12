import { describe, expect, it, vi } from 'vitest'
import { paraPartida } from '@/lib/partidas-sync/contrato'

/**
 * Teste de integração do adapter contra a API real.
 *
 * Só roda quando `API_FOOTBALL_KEY` está no ambiente — em CI fica pulado, para
 * não depender de rede nem gastar a cota diária (free = 100/dia).
 *
 *   API_FOOTBALL_KEY=xxx pnpm --filter @torcida/web test -- --run partidas-sync-adapter
 *
 * Usa temporada **2024** de propósito: é o que o plano free libera
 * (2022–2024). O código é idêntico para a temporada corrente — muda o número.
 */
const CHAVE = process.env.API_FOOTBALL_KEY

vi.mock('@/lib/env', () => ({
  env: { API_FOOTBALL_KEY: process.env.API_FOOTBALL_KEY, API_FOOTBALL_SEASON: 2024 },
  isProvedorPartidasConfigured: () => Boolean(process.env.API_FOOTBALL_KEY),
}))

describe.skipIf(!CHAVE)('adapter API-Football (rede real)', () => {
  it('traz fixtures da Série A 2024 já normalizados', async () => {
    const { provedorApiFootball } = await import('@/lib/partidas-sync/api-football')

    const partidas = await provedorApiFootball.listarPartidas({
      competicoes: [71], // Série A — 1 requisição
      janela: { de: new Date('2024-05-01'), ate: new Date('2024-05-08') },
      temporada: 2024,
    })

    expect(partidas.length).toBeGreaterThan(0)

    for (const p of partidas) {
      expect(p.fonteExternalId).toMatch(/^\d+$/)
      expect(p.timeCasaExternalId).toMatch(/^\d+$/)
      expect(p.timeForaExternalId).toMatch(/^\d+$/)
      expect(p.dataHora.getTime()).not.toBeNaN()
      expect(['AGENDADA', 'AO_VIVO', 'ENCERRADA', 'CANCELADA']).toContain(p.status)
    }

    // Jogos de maio/2024 já terminaram: placar tem que ter vindo.
    const encerradas = partidas.filter((p) => p.status === 'ENCERRADA')
    expect(encerradas.length).toBeGreaterThan(0)
    expect(encerradas[0].placarCasa).toBeTypeOf('number')
  })

  it('o Corinthians (131) aparece com mando e adversário corretos', async () => {
    const { provedorApiFootball } = await import('@/lib/partidas-sync/api-football')

    const partidas = await provedorApiFootball.listarPartidas({
      competicoes: [71],
      janela: { de: new Date('2024-05-01'), ate: new Date('2024-05-20') },
      temporada: 2024,
    })

    const doCorinthians = partidas.filter(
      (p) => p.timeCasaExternalId === '131' || p.timeForaExternalId === '131',
    )
    expect(doCorinthians.length).toBeGreaterThan(0)

    for (const p of doCorinthians) {
      const nossa = paraPartida(p, '131')
      expect(nossa.adversario).not.toBe('Corinthians')
      expect(['CASA', 'FORA']).toContain(nossa.mando)
      if (nossa.mando === 'CASA') expect(p.timeCasaExternalId).toBe('131')
      else expect(p.timeForaExternalId).toBe('131')
    }
  })

  it('temporada corrente responde erro de plano no free — falha alto, não silencia', async () => {
    const { provedorApiFootball } = await import('@/lib/partidas-sync/api-football')

    await expect(
      provedorApiFootball.listarPartidas({
        competicoes: [71],
        janela: { de: new Date('2026-08-01'), ate: new Date('2026-08-08') },
        temporada: 2026,
      }),
    ).rejects.toThrow(/Free plans do not have access to this season/)
  })
})
