import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { assertMembroAtivo } from '@/lib/authz'
import { getTenantFromHost } from '@/lib/tenant'
import { buscarComunidade } from '@/lib/comunidade-busca'

export async function GET(request: NextRequest) {
  try {
    const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
    if (!session?.user?.id || !tenant) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }
    await assertMembroAtivo(tenant.id, session.user.id)

    const q = (request.nextUrl.searchParams.get('q') ?? '').trim()
    const resultado = await buscarComunidade(tenant.id, session.user.id, q)

    return NextResponse.json(resultado)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro na busca.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
