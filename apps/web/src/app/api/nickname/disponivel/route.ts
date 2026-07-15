import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { checarNicknameDisponivel } from '@/lib/nickname-disponivel'

/**
 * GET /api/nickname/disponivel?q=meu_apelido
 * Público (cadastro) — se autenticado, ignora o próprio userId.
 */
export async function GET(request: Request) {
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
