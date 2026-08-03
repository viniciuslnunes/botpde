import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@torcida/db'
import {
  assertPodeEnviarNaConversa,
  criarMensagem,
  listMensagens,
  notificarNovaMensagem,
  serializeMensagem,
  MAX_CONTEUDO_MENSAGEM,
} from '@/lib/mensageria'
import { assertConversaAccess } from '@/lib/mensageria-api'
import { emitMensagemNova } from '@/lib/mensageria-bus'
import { excedeuLimiteEngajamento, registrarAcaoEngajamento } from '@/lib/engagement-rate-limit'
import { isCloudinaryUrl, isSocialUrl, isStickerPath, midiasComEmbedDoTexto } from '@/lib/social-embed'

const midiaSchema = z
  .string()
  .max(500)
  .refine(
    (url) => isCloudinaryUrl(url) || isSocialUrl(url) || isStickerPath(url),
    'Tipo de anexo não permitido',
  )

const enviarSchema = z
  .object({
    conteudo: z.string().trim().max(MAX_CONTEUDO_MENSAGEM).default(''),
    midias: z.array(midiaSchema).max(10).default([]),
    respostaAId: z.string().uuid().optional(),
  })
  .refine((d) => d.conteudo.length > 0 || d.midias.length > 0, {
    message: 'Mensagem vazia',
    path: ['conteudo'],
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
    const before = request.nextUrl.searchParams.get('before')
    const afterDate = after ? new Date(after) : null
    const beforeDate = before ? new Date(before) : null
    const afterValido = afterDate && !Number.isNaN(afterDate.getTime())
    const beforeValido = beforeDate && !Number.isNaN(beforeDate.getTime())

    const { mensagens, hasMore } = await listMensagens(conversaId, {
      after: !full && afterValido ? afterDate! : undefined,
      before: !full && !afterValido && beforeValido ? beforeDate! : undefined,
    })

    return NextResponse.json({
      mensagens: mensagens.map(serializeMensagem),
      hasMore,
    })
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
    const { userId, tenant, session, conversa, via } = await assertConversaAccess(conversaId)
    if (via === 'ticket_staff') {
      return NextResponse.json(
        { error: 'Assuma o ticket na fila da loja para enviar mensagens.' },
        { status: 403 },
      )
    }
    await assertPodeEnviarNaConversa(conversaId, userId)

    const { assertTicketPermiteEnvio } = await import('@/lib/loja-ticket')
    await assertTicketPermiteEnvio(conversaId)

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
    const midiasFinais = midiasComEmbedDoTexto(parsed.data.conteudo, parsed.data.midias)
    const mensagem = await criarMensagem(
      conversaId,
      userId,
      parsed.data.conteudo,
      midiasFinais,
      parsed.data.respostaAId,
    )

    const membros: Array<{ userId: string }> = await db.membroConversa.findMany({
      where: { conversaId, saiuEm: null },
      select: { userId: true },
    })
    emitMensagemNova(
      conversaId,
      membros.map((m) => m.userId),
    )

    const destinatarios = membros.map((m) => m.userId).filter((id) => id !== userId)
    if (destinatarios.length > 0) {
      await notificarNovaMensagem({
        conversaId,
        tenantId: tenant.id,
        autorId: userId,
        autorNome: session.user.name ?? 'Alguém',
        conversaTipo: conversa.tipo,
        conversaNome: conversa.nome,
        preview: parsed.data.conteudo || 'Enviou um anexo',
        destinatarios,
      })
    }

    return NextResponse.json({ mensagem: serializeMensagem(mensagem) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao enviar mensagem.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
