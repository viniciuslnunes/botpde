import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { assertMembroAtivo } from '@/lib/authz'
import { getActiveTenant } from '@/lib/tenant'
import { resolveTenantIdPortalComunidade } from '@/lib/comunidade-contexto'
import { buscarComunidade, type BuscaComunidadeModo } from '@/lib/comunidade-busca'

function resolverModoBusca(raw: string | null): BuscaComunidadeModo {
  return raw === 'rapida' ? 'rapida' : 'completa'
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    const tenantId = await resolveTenantIdPortalComunidade(session.user.id, session.user.email)
    if (!tenantId) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    const tenantAtivo = await getActiveTenant(session.user.id, session.user.email)
    if (tenantAtivo?.id === tenantId) {
      await assertMembroAtivo(tenantId, session.user.id)
    }

    const q = (request.nextUrl.searchParams.get('q') ?? '').trim()
    const modo = resolverModoBusca(request.nextUrl.searchParams.get('modo'))
    const resultado = await buscarComunidade(tenantId, session.user.id, q, { modo })

    return NextResponse.json(resultado)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro na busca.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
