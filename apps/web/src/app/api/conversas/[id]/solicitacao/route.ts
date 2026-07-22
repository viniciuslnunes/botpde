import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@torcida/db'
import {
  aprovarSolicitacaoMensagem,
  rejeitarSolicitacaoMensagem,
} from '@/lib/mensageria'
import { assertConversaAccess } from '@/lib/mensageria-api'
import { criarNotificacao } from '@/lib/notificacoes'
import { emitMensagemNova } from '@/lib/mensageria-bus'

const acaoSchema = z.object({
  acao: z.enum(['aprovar', 'rejeitar']),
})

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: conversaId } = await context.params
    const { userId, tenant, conversa } = await assertConversaAccess(conversaId)

    if (conversa.tipo !== 'DIRETA') {
      return NextResponse.json({ error: 'Solicitação inválida para este tipo de conversa.' }, { status: 400 })
    }

    const conversaMeta: { criadoPorId: string } | null = await db.conversa.findUnique({
      where: { id: conversaId },
      select: { criadoPorId: true },
    })
    if (!conversaMeta) {
      return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 })
    }

    const body: unknown = await request.json()
    const parsed = acaoSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' },
        { status: 400 },
      )
    }

    const remetente: { id: string; nome: string | null } | null = await db.user.findUnique({
      where: { id: conversaMeta.criadoPorId },
      select: { id: true, nome: true },
    })
    const destinatario: { nome: string | null } | null = await db.user.findUnique({
      where: { id: userId },
      select: { nome: true },
    })

    if (parsed.data.acao === 'aprovar') {
      await aprovarSolicitacaoMensagem(conversaId, userId)

      if (remetente) {
        await criarNotificacao({
          userId: remetente.id,
          tenantId: tenant.id,
          tipo: 'MENSAGEM_SOLICITACAO_APROVADA',
          titulo: 'Solicitação de mensagem aprovada',
          corpo: `${destinatario?.nome ?? 'O membro'} aceitou sua solicitação de conversa.`,
          link: `/portal/mensagens?c=${conversaId}`,
          atorId: userId,
        })
      }

      const membros: Array<{ userId: string }> = await db.membroConversa.findMany({
        where: { conversaId, saiuEm: null },
        select: { userId: true },
      })
      emitMensagemNova(
        conversaId,
        membros.map((m) => m.userId),
      )

      return NextResponse.json({ ok: true, status: 'aprovada' })
    }

    const { remetenteId } = await rejeitarSolicitacaoMensagem(conversaId, userId)

    await criarNotificacao({
      userId: remetenteId,
      tenantId: tenant.id,
      tipo: 'MENSAGEM_SOLICITACAO_REJEITADA',
      titulo: 'Solicitação de mensagem recusada',
      corpo: `${destinatario?.nome ?? 'O membro'} recusou sua solicitação de conversa.`,
      link: '/portal/mensagens',
      atorId: userId,
    })

    return NextResponse.json({ ok: true, status: 'rejeitada' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao processar solicitação.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
