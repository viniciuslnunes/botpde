import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@torcida/db'
import { PERMISSIONS } from '@torcida/types'
import { assertConversaAccess } from '@/lib/mensageria-api'
import { excedeuLimiteEngajamento, registrarAcaoEngajamento } from '@/lib/engagement-rate-limit'

const denunciaSchema = z.object({
  motivo: z.string().trim().min(5, 'Motivo deve ter ao menos 5 caracteres').max(500),
})

async function listarModeradoresMensagens(tenantId: string): Promise<string[]> {
  const rows: { userId: string }[] = await db.userRole.findMany({
    where: {
      tenantId,
      role: { permissions: { has: PERMISSIONS.MESSAGES_MODERATE } },
    },
    select: { userId: true },
  })
  return [...new Set(rows.map((row) => row.userId))]
}

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

    // A denúncia é registrada no tenant da CONVERSA — é a moderação daquela
    // torcida que arbitra o conteúdo trocado no contexto dela.
    const denuncia: { id: string } = await db.denunciaMensagem.create({
      data: {
        tenantId: conversa.tenantId,
        mensagemId: mensagem.id,
        denuncianteId: userId,
        motivo: parsed.data.motivo,
      },
      select: { id: true },
    })

    const moderadores = (await listarModeradoresMensagens(conversa.tenantId)).filter(
      (id) => id !== userId,
    )
    if (moderadores.length > 0) {
      await db.$transaction(
        moderadores.map((moderadorId) =>
          db.notificacao.create({
            data: {
              userId: moderadorId,
              tenantId: conversa.tenantId,
              tipo: 'DENUNCIA_NOVA',
              titulo: 'Nova denúncia de mensagem',
              corpo: parsed.data.motivo.slice(0, 140),
              link: '/admin/comunidade/moderacao',
            },
          }),
        ),
      )
    }

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
