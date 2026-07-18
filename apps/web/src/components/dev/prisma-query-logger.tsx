import { after } from 'next/server'
import { headers } from 'next/headers'
import { getAndResetPrismaMetrics, metricsEnabled } from '@torcida/db'

/**
 * Instrumentação de rota (custo zero quando desligada).
 * - Dev: log legível `[prisma] GET /rota — N queries (Xms db)`.
 * - Produção: só com `PERF_METRICS=1` — emite uma linha JSON por rota nos logs
 *   do Railway (`{"perf":"route",...}`) para agregar p95 de queries / tempo de
 *   banco / wall time por rota e priorizar a próxima rodada de otimização com
 *   dado real, sem backend externo.
 */
export async function PrismaQueryLogger() {
  if (!metricsEnabled()) return null

  const headersList = await headers()
  const pathname = headersList.get('x-pathname') ?? ''
  const method = headersList.get('x-method') ?? 'GET'
  const startedAt = Number(headersList.get('x-request-start') ?? '0')

  after(() => {
    const { count, dbMs } = getAndResetPrismaMetrics()
    if (count === 0) return
    const route = pathname || '(unknown)'
    const wallMs = startedAt > 0 ? Date.now() - startedAt : null

    if (process.env.NODE_ENV === 'development') {
      console.log(`[prisma] ${method} ${route} — ${count} queries (${Math.round(dbMs)}ms db)`)
      return
    }

    // Produção (PERF_METRICS=1): linha estruturada para agregação de p95.
    console.log(
      JSON.stringify({
        perf: 'route',
        method,
        route,
        queries: count,
        dbMs: Math.round(dbMs),
        wallMs,
        ts: new Date().toISOString(),
      }),
    )
  })

  return null
}
