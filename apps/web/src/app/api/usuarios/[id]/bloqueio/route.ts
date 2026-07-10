import { NextResponse } from 'next/server'
import { db } from '@torcida/db'
import { assertUsuarioMensageria } from '@/lib/mensageria-api'

/** Bloqueia o usuário alvo (mensageria): impede DMs em ambas as direções. */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: alvoId } = await context.params
    const { userId, tenant } = await assertUsuarioMensageria()
    if (alvoId === userId) {
      return NextResponse.json({ error: 'Não é possível bloquear a si mesmo.' }, { status: 400 })
    }

    await db.bloqueioUsuario.upsert({
      where: { bloqueadorId_bloqueadoId: { bloqueadorId: userId, bloqueadoId: alvoId } },
      create: { bloqueadorId: userId, bloqueadoId: alvoId },
      update: {},
    })

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: userId,
        acao: 'USUARIO_BLOQUEADO_MENSAGERIA',
        entidade: 'BloqueioUsuario',
        entidadeId: alvoId,
        detalhes: { bloqueadoId: alvoId },
      },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao bloquear usuário.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: alvoId } = await context.params
    const { userId } = await assertUsuarioMensageria()

    await db.bloqueioUsuario.deleteMany({
      where: { bloqueadorId: userId, bloqueadoId: alvoId },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao desbloquear usuário.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
