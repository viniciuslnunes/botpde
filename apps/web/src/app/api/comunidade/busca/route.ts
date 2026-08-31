import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { assertPodeBuscarNaComunidade } from '@/lib/authz'
import {
  resolverContextoComunidade,
  resolverEscopoComunidade,
  resolverTenantIdBuscaComunidade,
} from '@/lib/comunidade-contexto'
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

    const ctx = await resolverContextoComunidade(session.user.id, session.user.email)
    if (!ctx) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    const escopoParam = request.nextUrl.searchParams.get('escopo') ?? undefined
    const escopoDesejado = resolverEscopoComunidade(ctx, escopoParam)
    const escopo = escopoDesejado === 'nacional' && !ctx.afiliacao ? 'torcida' : escopoDesejado
    const tenantId = resolverTenantIdBuscaComunidade(ctx, escopo)

    if (!tenantId) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    await assertPodeBuscarNaComunidade(tenantId, session.user.id, session.user.email)

    const q = (request.nextUrl.searchParams.get('q') ?? '').trim()
    const modo = resolverModoBusca(request.nextUrl.searchParams.get('modo'))
    const resultado = await buscarComunidade(tenantId, session.user.id, q, { modo })

    return NextResponse.json(resultado)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro na busca.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
