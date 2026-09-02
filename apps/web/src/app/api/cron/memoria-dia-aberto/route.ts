import { NextResponse } from 'next/server'
import { dispatchMemoriaDiaAberto } from '@/lib/memoria-dia-aberto'

/**
 * Cron: notifica sócios quando a Memória do dia abre (jogo do clube / evento da unidade).
 * Protegido por `CRON_SECRET`. Cadência: 1×/dia (~08h SP).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const result = await dispatchMemoriaDiaAberto()
  return NextResponse.json({ ok: true, ...result })
}
