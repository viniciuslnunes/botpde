import { NextResponse } from 'next/server'
import { dispatchLembretesEventos } from '@/lib/eventos-lembretes'

/**
 * Cron de lembretes da Agenda (T−24h / T−2h / resumo do dia).
 * Protegido por `CRON_SECRET` (Bearer) — configurar no Railway/scheduler.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const result = await dispatchLembretesEventos()
  return NextResponse.json({ ok: true, ...result })
}
