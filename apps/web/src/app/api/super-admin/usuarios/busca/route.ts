import { NextRequest, NextResponse } from 'next/server'
import { db } from '@torcida/db'
import { auth } from '@/lib/auth'
import { isSuperAdminEmail } from '@/lib/tenant-context'

export type UsuarioBuscaItem = {
  id: string
  nome: string | null
  email: string | null
  nickname: string | null
  avatarUrl: string | null
}

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.email || !isSuperAdminEmail(session.user.email)) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 401 })
  }

  const q = (request.nextUrl.searchParams.get('q') ?? '').trim()
  if (q.length < 2) {
    return NextResponse.json({ usuarios: [] satisfies UsuarioBuscaItem[] })
  }

  const usuarios: UsuarioBuscaItem[] = await db.user.findMany({
    where: {
      OR: [
        { email: { contains: q, mode: 'insensitive' } },
        { nome: { contains: q, mode: 'insensitive' } },
        { nickname: { contains: q, mode: 'insensitive' } },
      ],
    },
    select: { id: true, nome: true, email: true, nickname: true, avatarUrl: true },
    take: 20,
    orderBy: { criadoEm: 'desc' },
  })

  return NextResponse.json({ usuarios })
}
