import { NextResponse } from 'next/server'
import { executarCicloFinanceiroTodosTenants } from '@/lib/financeiro-ciclo'

/**
 * Cron: gera mensalidades recorrentes + régua de lembretes.
 * Protegido por `CRON_SECRET` (Bearer).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const resultado = await executarCicloFinanceiroTodosTenants()
  return NextResponse.json({ ok: true, ...resultado })
}
