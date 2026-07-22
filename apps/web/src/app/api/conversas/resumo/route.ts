import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'
import { contarMensagensNaoLidas } from '@/lib/mensageria'
import { getStatusInboxMensageria } from '@/lib/mensageria-api'
import { resolverContextoComunidade } from '@/lib/comunidade-contexto'

export const dynamic = 'force-dynamic'

/** Resumo leve da inbox — badge e bloqueio sem carregar conversas. */
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    const tenant = await getTenantFromHost()
    if (tenant) {
      const status = await getStatusInboxMensageria(session.user.id, tenant.id)
      if (status.podeListar) {
        const naoLidas = await contarMensagensNaoLidas(session.user.id)
        return NextResponse.json({ naoLidas })
      }
    }

    const ctx = await resolverContextoComunidade(session.user.id, session.user.email)
    if (ctx?.tenantSintetico || ctx?.modo === 'nacional') {
      const naoLidas = await contarMensagensNaoLidas(session.user.id)
      return NextResponse.json({ naoLidas })
    }

    if (!tenant) {
      return NextResponse.json({ naoLidas: 0, semVinculo: true })
    }

    const statusBloqueado = await getStatusInboxMensageria(session.user.id, tenant.id)
    if (statusBloqueado.podeListar) {
      const naoLidas = await contarMensagensNaoLidas(session.user.id)
      return NextResponse.json({ naoLidas })
    }

    return NextResponse.json({
      naoLidas: 0,
      cadastroPendente: statusBloqueado.motivo === 'cadastro_pendente',
      semVinculo: statusBloqueado.motivo === 'sem_vinculo',
      cadastroReprovado: statusBloqueado.motivo === 'cadastro_reprovado',
    })
  } catch (error) {
    console.error('[api/conversas/resumo GET]', error)
    const message = error instanceof Error ? error.message : 'Erro ao carregar resumo.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
