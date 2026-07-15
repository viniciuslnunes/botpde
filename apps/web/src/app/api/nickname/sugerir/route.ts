import { NextResponse } from 'next/server'
import { candidatosNickname } from '@torcida/types'
import { auth } from '@/lib/auth'
import { checarNicknameDisponivel } from '@/lib/nickname-disponivel'
import {
  clientIpFromHeaders,
  excedeuLimitePublico,
  registrarUsoPublico,
} from '@/lib/public-rate-limit'

/**
 * GET /api/nickname/sugerir?nome=João Silva
 * Devolve o primeiro @ livre derivado do nome (cadastro / OAuth).
 */
export async function GET(request: Request) {
  const ip = clientIpFromHeaders(request.headers)
  if (excedeuLimitePublico('nicknameSuggest', ip)) {
    return NextResponse.json({ nickname: null, error: 'rate_limited' }, { status: 429 })
  }
  registrarUsoPublico('nicknameSuggest', ip)

  const { searchParams } = new URL(request.url)
  const nome = searchParams.get('nome') ?? ''

  if (nome.trim().length < 3) {
    return NextResponse.json({ nickname: null })
  }

  const session = await auth()
  const candidatos = candidatosNickname(nome)

  for (const candidato of candidatos) {
    const result = await checarNicknameDisponivel(candidato, session?.user?.id)
    if (result.ok && result.disponivel) {
      return NextResponse.json({ nickname: result.nickname })
    }
  }

  return NextResponse.json({ nickname: null })
}
