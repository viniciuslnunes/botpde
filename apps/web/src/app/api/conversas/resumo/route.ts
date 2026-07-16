import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'
import { contarMensagensNaoLidas } from '@/lib/mensageria'
import { getStatusInboxMensageria } from '@/lib/mensageria-api'

/** Resumo leve da inbox — badge e bloqueio sem carregar conversas. */
export async function GET() {
  try {
    const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
    if (!session?.user?.id || !tenant) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    const status = await getStatusInboxMensageria(session.user.id, tenant.id)
    if (!status.podeListar) {
      return NextResponse.json({
        naoLidas: 0,
        cadastroPendente: status.motivo === 'cadastro_pendente',
        semVinculo: status.motivo === 'sem_vinculo',
        cadastroReprovado: status.motivo === 'cadastro_reprovado',
      })
    }

    const naoLidas = await contarMensagensNaoLidas(session.user.id)
    return NextResponse.json({ naoLidas })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao carregar resumo.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
