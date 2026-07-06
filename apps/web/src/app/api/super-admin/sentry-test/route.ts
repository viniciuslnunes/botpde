import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { superAdminEmails } from '@/lib/env'

// Rota temporária de diagnóstico (VIN-5) — remover depois de validar o Sentry
// em produção. Gated por super admin: não autenticado/autorizado vê 404,
// igual a uma rota inexistente (não revela que isto existe).
export async function GET() {
  const session = await auth()

  if (!session?.user?.email || !superAdminEmails.includes(session.user.email)) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  Sentry.captureException(new Error('Teste manual de validação do Sentry em produção (VIN-5)'))
  await Sentry.flush(2000)

  return NextResponse.json({ ok: true, message: 'Evento de teste enviado ao Sentry' })
}
