import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { salvarPerfilSocial } from '@/lib/salvar-perfil-social'

export const dynamic = 'force-dynamic'

/** Persiste banner/avatar/bio — route handler (como upload) para confiabilidade atrás de proxy. */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    const body: unknown = await request.json()
    const perfil = await salvarPerfilSocial(session.user.id, body)

    return NextResponse.json({ ok: true, perfil })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Não foi possível salvar.'
    const status =
      message === 'Não autenticado.' ? 401
      : message === 'Tenant não encontrado' ? 404
      : 400
    return NextResponse.json({ error: message }, { status })
  }
}
