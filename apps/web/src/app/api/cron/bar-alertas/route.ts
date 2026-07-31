import { NextResponse } from 'next/server'
import {
  dispatchAlertasComandaVencidaBar,
  dispatchAlertasEstoqueBaixoBar,
  dispatchAlertasFiadoVencidoBar,
} from '@/lib/bar-alertas'

/**
 * Cron de alertas do Bar orientados a tempo (estoque baixo / comanda e fiado legado).
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

  const [estoqueBaixo, comandaVencida, fiadoVencido] = await Promise.all([
    dispatchAlertasEstoqueBaixoBar(),
    dispatchAlertasComandaVencidaBar(),
    // Legado: no-op seguro se não houver BarFiado PENDENTE.
    dispatchAlertasFiadoVencidoBar(),
  ])

  return NextResponse.json({ ok: true, estoqueBaixo, comandaVencida, fiadoVencido })
}
