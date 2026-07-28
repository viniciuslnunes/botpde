import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@torcida/db'
import { assertSalaAnfitriao, assertSalaMembro } from '@/lib/salas-api'

const votoSchema = z.object({
  opcaoId: z.string().uuid(),
})

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; enqueteId: string }> },
) {
  try {
    const { id: salaId, enqueteId } = await context.params
    const { session, tenant, isSuperAdminViewer } = await assertSalaMembro(salaId)
    if (isSuperAdminViewer) {
      return NextResponse.json(
        { error: 'Super admin tem acesso somente de visualização a esta sala.' },
        { status: 403 },
      )
    }

    const enquete = await db.enqueteReuniao.findFirst({
      where: { id: enqueteId, salaId, encerradaEm: null },
      include: { opcoes: { select: { id: true } } },
    })
    if (!enquete) {
      return NextResponse.json({ error: 'Enquete indisponível.' }, { status: 404 })
    }

    const body: unknown = await request.json()
    const parsed = votoSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Voto inválido' },
        { status: 400 },
      )
    }

    const opcaoValida = enquete.opcoes.some((o: { id: string }) => o.id === parsed.data.opcaoId)
    if (!opcaoValida) {
      return NextResponse.json({ error: 'Opção inválida.' }, { status: 400 })
    }

    await db.votoEnqueteReuniao.upsert({
      where: { enqueteId_userId: { enqueteId, userId: session.user.id } },
      create: {
        enqueteId,
        opcaoId: parsed.data.opcaoId,
        userId: session.user.id,
      },
      update: { opcaoId: parsed.data.opcaoId },
    })

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'SALA_ENQUETE_VOTO',
        entidade: 'EnqueteReuniao',
        entidadeId: enqueteId,
        detalhes: { opcaoId: parsed.data.opcaoId },
      },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao registrar voto.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function PATCH(
  _request: NextRequest,
  context: { params: Promise<{ id: string; enqueteId: string }> },
) {
  try {
    const { id: salaId, enqueteId } = await context.params
    const { session, tenant } = await assertSalaAnfitriao(salaId)

    const enquete = await db.enqueteReuniao.findFirst({
      where: { id: enqueteId, salaId, encerradaEm: null },
      select: { id: true },
    })
    if (!enquete) {
      return NextResponse.json({ error: 'Enquete não encontrada.' }, { status: 404 })
    }

    await db.enqueteReuniao.update({
      where: { id: enqueteId },
      data: { encerradaEm: new Date() },
    })

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'SALA_ENQUETE_ENCERRADA',
        entidade: 'EnqueteReuniao',
        entidadeId: enqueteId,
      },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao encerrar enquete.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
