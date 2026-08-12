import { NextResponse } from 'next/server'
import { sincronizarPartidas } from '@/lib/partidas-sync/sync'

/**
 * Cron de sync de `Partida` a partir do provedor externo (decisão #7).
 * Protegido por `CRON_SECRET` (Bearer) — configurar no Railway/scheduler.
 *
 * Cadência recomendada: 1×/dia. Custa 1 requisição por competição (~6 hoje),
 * cobrindo todos os clubes de cada uma na janela. Sem `API_FOOTBALL_KEY`
 * responde `configurado: false` sem erro — a Agenda segue no cadastro manual.
 *
 * Ver `docs/data/integracao-api-football.md`.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const resultado = await sincronizarPartidas()
    return NextResponse.json({ ok: true, ...resultado })
  } catch (e) {
    // Falha do provedor (cota, plano, rede) não pode derrubar o scheduler.
    const message = e instanceof Error ? e.message : 'erro desconhecido'
    return NextResponse.json({ ok: false, error: message }, { status: 502 })
  }
}
