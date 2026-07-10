import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { assertMembroAtivo } from '@/lib/authz'
import { getTenantFromHost } from '@/lib/tenant'
import {
  listarNotificacoesSociais,
  type FiltroNotificacaoSocial,
} from '@/lib/notificacoes-comunidade'

const FILTROS_VALIDOS = new Set<FiltroNotificacaoSocial>([
  'todas',
  'mencoes',
  'reposts',
  'reacoes',
  'seguimento',
])

export async function GET(request: NextRequest) {
  try {
    const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
    if (!session?.user?.id || !tenant) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }
    await assertMembroAtivo(tenant.id, session.user.id)

    const raw = request.nextUrl.searchParams.get('filtro') ?? 'todas'
    const filtro = FILTROS_VALIDOS.has(raw as FiltroNotificacaoSocial)
      ? (raw as FiltroNotificacaoSocial)
      : 'todas'

    const notificacoes = await listarNotificacoesSociais(
      tenant.id,
      session.user.id,
      filtro,
    )

    return NextResponse.json({
      notificacoes: notificacoes.map((n) => ({
        ...n,
        criadoEm: n.criadoEm.toISOString(),
      })),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao listar notificações.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
