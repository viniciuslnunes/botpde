import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { assertMembroAtivo } from '@/lib/authz'
import { getTenantFromHost } from '@/lib/tenant'
import { db } from '@torcida/db'

const enviarSchema = z.object({
  conteudo: z.string().trim().min(1, 'Mensagem vazia').max(800),
})

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: salaId } = await context.params
    const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
    if (!session?.user?.id || !tenant) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    await assertMembroAtivo(tenant.id, session.user.id)

    const after = request.nextUrl.searchParams.get('after')
    const afterDate = after ? new Date(after) : null

    const mensagens = await db.mensagemReuniao.findMany({
      where: {
        salaId,
        sala: { tenantId: tenant.id, encerradaEm: null },
        ...(afterDate && !Number.isNaN(afterDate.getTime())
          ? { criadoEm: { gt: afterDate } }
          : {}),
      },
      include: {
        autor: { select: { id: true, nome: true, avatarUrl: true } },
      },
      orderBy: { criadoEm: 'asc' },
      take: 100,
    })

    return NextResponse.json({
      mensagens: mensagens.map((m: (typeof mensagens)[number]) => ({
        id: m.id,
        conteudo: m.conteudo,
        criadoEm: m.criadoEm.toISOString(),
        autor: m.autor,
      })),
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
    const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
    if (!session?.user?.id || !tenant) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    await assertMembroAtivo(tenant.id, session.user.id)

    const body: unknown = await request.json()
    const parsed = enviarSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Mensagem inválida' },
        { status: 400 },
      )
    }

    const sala = await db.salaReuniao.findFirst({
      where: { id: salaId, tenantId: tenant.id, encerradaEm: null },
      select: { id: true },
    })
    if (!sala) {
      return NextResponse.json({ error: 'Sala indisponível.' }, { status: 404 })
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

    return NextResponse.json({
      mensagem: {
        id: mensagem.id,
        conteudo: mensagem.conteudo,
        criadoEm: mensagem.criadoEm.toISOString(),
        autor: mensagem.autor,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao enviar mensagem.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
