import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@torcida/db'
import {
  criarMensagem,
  listMensagens,
  listMembrosConversa,
  serializeMensagem,
  MAX_CONTEUDO_MENSAGEM,
} from '@/lib/mensageria'
import { assertConversaAccess } from '@/lib/mensageria-api'
import { excedeuLimiteEngajamento, registrarAcaoEngajamento } from '@/lib/engagement-rate-limit'
import { criarNotificacao } from '@/lib/notificacoes'
import { isCloudinaryUrl, isSocialUrl, isStickerPath } from '@/lib/social-embed'

const midiaSchema = z
  .string()
  .max(500)
  .refine(
    (url) => isCloudinaryUrl(url) || isSocialUrl(url) || isStickerPath(url),
    'Tipo de anexo não permitido',
  )

const enviarSchema = z.object({
  conteudo: z.string().trim().min(1, 'Mensagem vazia').max(MAX_CONTEUDO_MENSAGEM),
  midias: z.array(midiaSchema).max(10).default([]),
  respostaAId: z.string().uuid().optional(),
})

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: conversaId } = await context.params
    await assertConversaAccess(conversaId)

    const full = request.nextUrl.searchParams.get('full') === '1'
    const after = request.nextUrl.searchParams.get('after')
    const afterDate = after ? new Date(after) : null
    const valido = afterDate && !Number.isNaN(afterDate.getTime())

    const mensagens = await listMensagens(conversaId, {
      after: full || !valido ? undefined : afterDate!,
    })

    return NextResponse.json({ mensagens: mensagens.map(serializeMensagem) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao carregar mensagens.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: conversaId } = await context.params
    const { userId, tenant, conversa } = await assertConversaAccess(conversaId)

    const body: unknown = await request.json()
    const parsed = enviarSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Mensagem inválida' },
        { status: 400 },
      )
    }

    const limiterKey = `dm:${tenant.id}:${userId}`
    if (excedeuLimiteEngajamento(limiterKey)) {
      return NextResponse.json(
        { error: 'Você está enviando mensagens rápido demais. Aguarde um pouco.' },
        { status: 429 },
      )
    }

    // respostaA precisa pertencer à MESMA conversa
    if (parsed.data.respostaAId) {
      const alvo: { id: string } | null = await db.mensagemDireta.findFirst({
        where: { id: parsed.data.respostaAId, conversaId },
        select: { id: true },
      })
      if (!alvo) {
        return NextResponse.json({ error: 'Mensagem respondida não encontrada.' }, { status: 400 })
      }
    }

    registrarAcaoEngajamento(limiterKey)
    const mensagem = await criarMensagem(
      conversaId,
      userId,
      parsed.data.conteudo,
      parsed.data.midias,
      parsed.data.respostaAId,
    )

    // Notifica quem estava "em dia" (sem não-lidas antes desta mensagem) e não
    // silenciou a conversa. Nota: Notificacao carrega o tenant da conversa —
    // membro de torcida aliada vê o não-lido pelo badge de mensagens (que é
    // independente de tenant), não pelo sino.
    const membros = await listMembrosConversa(conversaId)
    const destinatarios = membros.filter((m) => m.userId !== userId)
    void Promise.all(
      destinatarios.map(async (dest) => {
        const membroRow: { silenciada: boolean; ultimaLeituraEm: Date | null } | null =
          await db.membroConversa.findFirst({
            where: { conversaId, userId: dest.userId, saiuEm: null },
            select: { silenciada: true, ultimaLeituraEm: true },
          })
        if (!membroRow || membroRow.silenciada) return
        const naoLidasAntes = await db.mensagemDireta.count({
          where: {
            conversaId,
            autorId: { not: dest.userId },
            removidaEm: null,
            id: { not: mensagem.id },
            ...(membroRow.ultimaLeituraEm
              ? { criadoEm: { gt: membroRow.ultimaLeituraEm } }
              : {}),
          },
        })
        if (naoLidasAntes > 0) return
        await criarNotificacao({
          userId: dest.userId,
          tenantId: conversa.tenantId,
          tipo: 'NOVA_MENSAGEM',
          titulo:
            conversa.tipo === 'DIRETA'
              ? 'Nova mensagem direta'
              : `Nova mensagem em ${conversa.nome ?? (conversa.tipo === 'CANAL' ? 'canal' : 'grupo')}`,
          corpo: parsed.data.conteudo.slice(0, 140),
          link: `/portal/mensagens?c=${conversaId}`,
        })
      }),
    ).catch(() => {
      // notificação é best-effort — nunca derruba o envio
    })

    return NextResponse.json({ mensagem: serializeMensagem(mensagem) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao enviar mensagem.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
