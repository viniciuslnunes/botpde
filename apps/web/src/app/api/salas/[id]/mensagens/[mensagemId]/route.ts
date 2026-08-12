import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@torcida/db'
import { assertSalaAnfitriao } from '@/lib/salas-api'

const editarSchema = z.object({
  conteudo: z.string().trim().min(1).max(800).optional(),
  destacada: z.boolean().optional(),
})

function serializeMensagem(m: {
  id: string
  conteudo: string
  criadoEm: Date
  editadaEm: Date | null
  destacada: boolean
  autor: { id: string; nome: string | null; avatarUrl: string | null }
}) {
  return {
    id: m.id,
    conteudo: m.conteudo,
    criadoEm: m.criadoEm.toISOString(),
    editadaEm: m.editadaEm?.toISOString() ?? null,
    destacada: m.destacada,
    autor: m.autor,
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; mensagemId: string }> },
) {
  try {
    const { id: salaId, mensagemId } = await context.params
    const { session, tenant } = await assertSalaAnfitriao(salaId)

    const body: unknown = await request.json()
    const parsed = editarSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' },
        { status: 400 },
      )
    }
    if (parsed.data.conteudo === undefined && parsed.data.destacada === undefined) {
      return NextResponse.json({ error: 'Nada para atualizar.' }, { status: 400 })
    }

    const mensagem = await db.mensagemReuniao.findFirst({
      where: { id: mensagemId, salaId, sala: { tenantId: tenant.id }, excluidaEm: null },
      select: { id: true },
    })
    if (!mensagem) {
      return NextResponse.json({ error: 'Mensagem não encontrada.' }, { status: 404 })
    }

    const atualizada = await db.mensagemReuniao.update({
      where: { id: mensagemId },
      data: {
        ...(parsed.data.conteudo !== undefined
          ? { conteudo: parsed.data.conteudo, editadaEm: new Date() }
          : {}),
        ...(parsed.data.destacada !== undefined ? { destacada: parsed.data.destacada } : {}),
      },
      include: { autor: { select: { id: true, nome: true, avatarUrl: true } } },
    })

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'SALA_MENSAGEM_EDITADA',
        entidade: 'MensagemReuniao',
        entidadeId: mensagemId,
        detalhes: { destacada: parsed.data.destacada, editouTexto: !!parsed.data.conteudo },
      },
    })

    return NextResponse.json({ mensagem: serializeMensagem(atualizada) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao editar mensagem.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string; mensagemId: string }> },
) {
  try {
    const { id: salaId, mensagemId } = await context.params
    const { session, tenant } = await assertSalaAnfitriao(salaId)

    const mensagem = await db.mensagemReuniao.findFirst({
      where: { id: mensagemId, salaId, sala: { tenantId: tenant.id }, excluidaEm: null },
      select: { id: true },
    })
    if (!mensagem) {
      return NextResponse.json({ error: 'Mensagem não encontrada.' }, { status: 404 })
    }

    await db.mensagemReuniao.update({
      where: { id: mensagemId },
      data: { excluidaEm: new Date() },
    })

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'SALA_MENSAGEM_EXCLUIDA',
        entidade: 'MensagemReuniao',
        entidadeId: mensagemId,
      },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao excluir mensagem.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
