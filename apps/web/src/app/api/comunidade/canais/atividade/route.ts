import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { ehOperadorPlataforma, resolveAfiliacaoComunidadeDoUsuario } from '@/lib/authz'
import { resolveTenantMinhaTorcida } from '@/lib/comunidade-contexto'
import { getAtividadeCanaisBarra } from '@/lib/comunidade-canal-atividade-server'
import { MAX_CANAIS_ATIVIDADE } from '@/lib/comunidade-canal-atividade'
import { isSuperAdminEmail } from '@/lib/tenant-context'

export const dynamic = 'force-dynamic'

const querySchema = z.object({
  ids: z.string().optional(),
  afiliacaoId: z.string().uuid().optional(),
})

/**
 * Cabeças de atividade (MAX criadoEm) dos canais abertos na barra + CN.
 * Client compara com last-seen local após ping SSE do feed.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    const parsed = querySchema.safeParse({
      ids: request.nextUrl.searchParams.get('ids') ?? undefined,
      afiliacaoId: request.nextUrl.searchParams.get('afiliacaoId') ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: 'Parâmetros inválidos.' }, { status: 400 })
    }

    const conversaIds = (parsed.data.ids ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, MAX_CANAIS_ATIVIDADE)

    let afiliacaoId = parsed.data.afiliacaoId ?? null
    if (afiliacaoId && !isSuperAdminEmail(session.user.email)) {
      const afiliacaoViewer = await resolveAfiliacaoComunidadeDoUsuario(
        session.user.id,
        session.user.email,
      )
      if (!afiliacaoViewer || afiliacaoViewer !== afiliacaoId) {
        return NextResponse.json({ error: 'Sem permissão para este feed.' }, { status: 403 })
      }
    }

    const tenant = await resolveTenantMinhaTorcida(session.user.id, session.user.email)
    const leituraOperador = tenant
      ? await ehOperadorPlataforma(session.user.id, session.user.email, tenant.id)
      : isSuperAdminEmail(session.user.email)

    const { heads } = await getAtividadeCanaisBarra({
      userId: session.user.id,
      conversaIds,
      afiliacaoId,
      viewerTenantId: tenant?.id ?? null,
      leituraOperador,
    })

    return NextResponse.json({ heads })
  } catch (err) {
    console.warn(
      '[comunidade/canais/atividade]',
      err instanceof Error ? err.message : err,
    )
    return NextResponse.json({ error: 'Indisponível.' }, { status: 503 })
  }
}
