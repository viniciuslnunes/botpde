import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { assertPodeBuscarNaComunidade } from '@/lib/authz'
import {
  resolverContextoComunidade,
  resolverEscopoComunidade,
  resolverTenantIdBuscaComunidade,
} from '@/lib/comunidade-contexto'
import { buscarMembrosComunidade } from '@/lib/comunidade-busca'

/**
 * Typeahead de menções no composer. Aceita `?escopo=nacional` para a
 * Comunidade Nacional (torcedor global / aba Nacional) — mesmo padrão da
 * busca unificada.
 *
 * Autorização: leitura. Super-admin sem `SaasMembro` na TO ativa consulta;
 * o recorte é o tenant do escopo + `resolveVisibleTenantIdsForFeed`
 * (hierarquia + aliados; rivais fora; operador numa TO real não vê coirmãs).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    const q = (request.nextUrl.searchParams.get('q') ?? '').trim()
    const escopoParam = request.nextUrl.searchParams.get('escopo') ?? undefined

    const ctx = await resolverContextoComunidade(session.user.id, session.user.email)
    if (!ctx) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    const escopoDesejado = resolverEscopoComunidade(ctx, escopoParam)
    const escopo = escopoDesejado === 'nacional' && !ctx.afiliacao ? 'torcida' : escopoDesejado
    const tenantId = resolverTenantIdBuscaComunidade(ctx, escopo)

    if (!tenantId) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    await assertPodeBuscarNaComunidade(tenantId, session.user.id, session.user.email)

    const membros = await buscarMembrosComunidade(tenantId, session.user.id, q, {
      modo: 'rapida',
    })

    return NextResponse.json({ membros })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao buscar membros.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
