import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@torcida/db'
import { assertConversaAccess } from '@/lib/mensageria-api'
import { excedeuLimiteEngajamento, registrarAcaoEngajamento } from '@/lib/engagement-rate-limit'
import { notificarDenunciaMensagem } from '@/lib/notificacoes-routing'

const denunciaSchema = z.object({
  motivo: z.string().trim().min(5, 'Motivo deve ter ao menos 5 caracteres').max(500),
})

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; mensagemId: string }> },
) {
  try {
    const { id: conversaId, mensagemId } = await context.params
    const { userId, tenant, conversa } = await assertConversaAccess(conversaId)

    const body: unknown = await request.json()
    const parsed = denunciaSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Denúncia inválida' },
        { status: 400 },
      )
    }

    const limiterKey = `report-msg:${tenant.id}:${userId}`
    if (excedeuLimiteEngajamento(limiterKey)) {
      return NextResponse.json(
        { error: 'Você atingiu o limite de denúncias por minuto.' },
        { status: 429 },
      )
    }

    const mensagem: { id: string; autorId: string } | null = await db.mensagemDireta.findFirst({
      where: { id: mensagemId, conversaId },
      select: { id: true, autorId: true },
    })
    if (!mensagem) {
      return NextResponse.json({ error: 'Mensagem não encontrada.' }, { status: 404 })
    }
    if (mensagem.autorId === userId) {
      return NextResponse.json({ error: 'Não é possível denunciar a própria mensagem.' }, { status: 400 })
    }

    registrarAcaoEngajamento(limiterKey)

    const denuncia: { id: string } = await db.denunciaMensagem.create({
      data: {
        tenantId: conversa.tenantId,
        mensagemId: mensagem.id,
        denuncianteId: userId,
        motivo: parsed.data.motivo,
      },
      select: { id: true },
    })

    await notificarDenunciaMensagem({
      tenantId: conversa.tenantId,
      motivo: parsed.data.motivo,
      denuncianteUserId: userId,
    })

    await db.auditLog.create({
      data: {
        tenantId: conversa.tenantId,
        atorId: userId,
        acao: 'MENSAGEM_DENUNCIADA',
        entidade: 'DenunciaMensagem',
        entidadeId: denuncia.id,
        detalhes: { mensagemId: mensagem.id, conversaId },
      },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao denunciar mensagem.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
