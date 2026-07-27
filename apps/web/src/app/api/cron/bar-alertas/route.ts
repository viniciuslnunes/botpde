import { NextResponse } from 'next/server'
import { dispatchAlertasEstoqueBaixoBar, dispatchAlertasFiadoVencidoBar } from '@/lib/bar-alertas'

/**
 * Cron de alertas do Bar orientados a tempo (estoque baixo / fiado vencido).
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

  const [estoqueBaixo, fiadoVencido] = await Promise.all([
    dispatchAlertasEstoqueBaixoBar(),
    dispatchAlertasFiadoVencidoBar(),
  ])

  return NextResponse.json({ ok: true, estoqueBaixo, fiadoVencido })
}
