import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { checarNicknameDisponivel } from '@/lib/nickname-disponivel'
import {
  clientIpFromHeaders,
  excedeuLimitePublico,
  registrarUsoPublico,
} from '@/lib/public-rate-limit'

/**
 * GET /api/nickname/disponivel?q=meu_apelido
 * Público (cadastro) — se autenticado, ignora o próprio userId.
 */
export async function GET(request: Request) {
  const ip = clientIpFromHeaders(request.headers)
  if (excedeuLimitePublico('nicknameCheck', ip)) {
    return NextResponse.json(
      { ok: false, motivo: 'Muitas verificações. Aguarde um momento.' },
      { status: 429 },
    )
  }
  registrarUsoPublico('nicknameCheck', ip)

  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') ?? ''

  if (!q.trim()) {
    return NextResponse.json(
      { ok: false, motivo: 'Informe um apelido.' },
      { status: 400 },
    )
  }

  const session = await auth()
  const result = await checarNicknameDisponivel(q, session?.user?.id)

  return NextResponse.json(result)
}
