import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Carrega `API_FOOTBALL_*` de `apps/web/.env.local` para os comandos que rodam
 * fora do Next (vitest de seed e de auditoria) — eles não leem `.env` sozinhos.
 *
 * **Por que não fica no `setup-env.ts`:** aquele setup vale para a suíte
 * unitária inteira, e o teste de adapter (`partidas-sync-adapter.test.ts`) se
 * ativa quando a chave existe. Carregar lá faria todo `pnpm test` bater na API
 * real e queimar cota. Aqui é opt-in: só quem importa recebe a chave.
 *
 * `process.env` sempre vence, então dá para sobrescrever na linha de comando:
 *   API_FOOTBALL_SEASON=2023 pnpm --filter @torcida/web seed:partidas-sync
 */
export function carregarEnvApiFootball(): void {
  const arquivo = resolve(process.cwd(), '.env.local')
  if (!existsSync(arquivo)) return

  for (const linha of readFileSync(arquivo, 'utf8').split('\n')) {
    const texto = linha.trim()
    if (!texto || texto.startsWith('#')) continue
    if (!texto.startsWith('API_FOOTBALL_')) continue

    const igual = texto.indexOf('=')
    if (igual === -1) continue

    const chave = texto.slice(0, igual).trim()
    let valor = texto.slice(igual + 1).trim()
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1)
    }

    if (!Object.hasOwn(process.env, chave)) process.env[chave] = valor
  }
}
