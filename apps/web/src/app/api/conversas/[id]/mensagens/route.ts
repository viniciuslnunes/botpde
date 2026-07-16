import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@torcida/db'
import {
  criarMensagem,
  listMensagens,
  serializeMensagem,
  MAX_CONTEUDO_MENSAGEM,
} from '@/lib/mensageria'
import { assertConversaAccess } from '@/lib/mensageria-api'
import { emitMensagemNova } from '@/lib/mensageria-bus'
import { excedeuLimiteEngajamento, registrarAcaoEngajamento } from '@/lib/engagement-rate-limit'
import { isCloudinaryUrl, isSocialUrl, isStickerPath } from '@/lib/social-embed'

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
    const { userId, tenant } = await assertConversaAccess(conversaId)

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

    const membros: Array<{ userId: string }> = await db.membroConversa.findMany({
      where: { conversaId, saiuEm: null },
      select: { userId: true },
    })
    emitMensagemNova(
      conversaId,
      membros.map((m) => m.userId),
    )

    return NextResponse.json({ mensagem: serializeMensagem(mensagem) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao enviar mensagem.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
