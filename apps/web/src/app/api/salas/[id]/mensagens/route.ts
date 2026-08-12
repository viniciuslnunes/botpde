import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@torcida/db'
import { assertSalaMembro } from '@/lib/salas-api'

const enviarSchema = z.object({
  conteudo: z.string().trim().min(1, 'Mensagem vazia').max(800),
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

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: salaId } = await context.params
    await assertSalaMembro(salaId)

    const full = request.nextUrl.searchParams.get('full') === '1'
    const after = request.nextUrl.searchParams.get('after')
    const afterDate = after ? new Date(after) : null

    const mensagens = await db.mensagemReuniao.findMany({
      where: {
        salaId,
        excluidaEm: null,
        ...(full || !afterDate || Number.isNaN(afterDate.getTime())
          ? {}
          : { criadoEm: { gt: afterDate } }),
      },
      include: {
        autor: { select: { id: true, nome: true, avatarUrl: true } },
      },
      orderBy: [{ destacada: 'desc' }, { criadoEm: 'asc' }],
      take: full ? 100 : 100,
    })

    return NextResponse.json({
      mensagens: mensagens.map((m: (typeof mensagens)[number]) => serializeMensagem(m)),
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
    const { id: salaId } = await context.params
    const { session, sala, isSuperAdminViewer } = await assertSalaMembro(salaId)
    if (isSuperAdminViewer) {
      return NextResponse.json(
        { error: 'Super admin tem acesso somente de visualização a esta sala.' },
        { status: 403 },
      )
    }

    const body: unknown = await request.json()
    const parsed = enviarSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Mensagem inválida' },
        { status: 400 },
      )
    }

    const mensagem = await db.mensagemReuniao.create({
      data: {
        salaId: sala.id,
        autorId: session.user.id,
        conteudo: parsed.data.conteudo,
      },
      include: {
        autor: { select: { id: true, nome: true, avatarUrl: true } },
      },
    })

    return NextResponse.json({ mensagem: serializeMensagem(mensagem) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao enviar mensagem.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
