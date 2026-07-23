import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { assertMembroAtivo } from '@/lib/authz'
import { getActiveTenant } from '@/lib/tenant'
import {
  resolverContextoComunidade,
  resolverEscopoComunidade,
} from '@/lib/comunidade-contexto'
import { buscarMembrosComunidade } from '@/lib/comunidade-busca'

/**
 * Typeahead de menções no composer. Aceita `?escopo=nacional` para a
 * Comunidade Nacional (torcedor global / aba Nacional) — mesmo padrão da
 * busca unificada; sem isso `assertMembroAtivo` quebra no tenant sintético.
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

    let tenantId: string | null = null
    if (escopo === 'nacional' && ctx.tenantSintetico) {
      tenantId = ctx.tenantSintetico.id
    } else if (ctx.modo === 'torcida') {
      tenantId = ctx.tenant.id
      await assertMembroAtivo(tenantId, session.user.id)
    } else if (ctx.tenantSintetico) {
      tenantId = ctx.tenantSintetico.id
    } else {
      const ativo = await getActiveTenant(session.user.id, session.user.email)
      if (ativo) {
        tenantId = ativo.id
        if (!ativo.sintetico) await assertMembroAtivo(tenantId, session.user.id)
      }
    }

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant não resolvido.' }, { status: 400 })
    }

    const membros = await buscarMembrosComunidade(tenantId, session.user.id, q)

    return NextResponse.json({ membros })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao buscar membros.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
