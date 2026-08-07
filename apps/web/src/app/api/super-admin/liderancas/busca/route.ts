import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import {
  sugerirLiderancas,
  type SugestaoLideranca,
} from '@/lib/liderancas-console'

export type { SugestaoLideranca }

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.email || !isSuperAdminEmail(session.user.email)) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 401 })
  }

  const q = (request.nextUrl.searchParams.get('q') ?? '').trim()
  if (q.length < 2) {
    return NextResponse.json({ sugestoes: [] satisfies SugestaoLideranca[] })
  }

  const sugestoes: SugestaoLideranca[] = await sugerirLiderancas(q, 12)
  return NextResponse.json({ sugestoes })
}
