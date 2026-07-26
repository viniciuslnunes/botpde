import { NextRequest, NextResponse } from 'next/server'
import { db } from '@torcida/db'
import { auth } from '@/lib/auth'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import { exportarDadosUsuario } from '@/lib/super-admin/exportar-dados-usuario'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id || !session.user.email || !isSuperAdminEmail(session.user.email)) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 401 })
  }

  const { id } = await params
  const dados = await exportarDadosUsuario(id)
  if (!dados) {
    return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 })
  }

  // Auditoria em cada tenant onde o usuário tem vínculo — rastreia quem acessou dados sensíveis de quem.
  const tenantIds = dados.vinculos.map((v) => v.tenantId)
  if (tenantIds.length > 0) {
    await db.auditLog.createMany({
      data: tenantIds.map((tenantId) => ({
        tenantId,
        atorId: session.user.id,
        acao: 'LGPD_EXPORTACAO_SOLICITADA',
        entidade: 'User',
        entidadeId: id,
        detalhes: { usuarioEmail: dados.usuario.email },
      })),
    })
  }

  return new NextResponse(JSON.stringify(dados, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="dados-usuario-${id}.json"`,
    },
  })
}
